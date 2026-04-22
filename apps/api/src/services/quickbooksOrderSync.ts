import crypto from "crypto";

import { Prisma, QuickbooksInvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../db/prisma";
import {
  QuickbooksApiError,
  buildNeutralQuickbooksInvoicePayload,
  createQuickbooksCustomer,
  createQuickbooksInvoice,
  findQuickbooksCustomerByEmailOrName,
  getQuickbooksConnectionStatus,
  getQuickbooksEnv,
  getQuickbooksEnvStatus,
  sendQuickbooksInvoice,
} from "./quickbooks";

const UNSAFE_SOURCE_TEXT_PATTERN =
  /\b(miami science|woocommerce|peptide|peptides|storefront|checkout|sku|product name|line item|raw item)\b/i;
const UNSAFE_METADATA_KEY_PATTERN =
  /\b(product|products|item|items|sku|skus|peptide|brand|store|storefront|checkout|domain|source[_-]?site)\b/i;

const metadataValueSchema = z.union([z.string().max(300), z.number().finite(), z.boolean(), z.null()]);

const internalOrderSyncSchema = z
  .object({
    internal_source: z.string().trim().min(1).max(64),
    internal_order_id: z.string().trim().min(1).max(128),
    internal_order_number: z.string().trim().min(1).max(128),
    created_at: z.string().datetime({ offset: true }).optional(),
    currency: z.string().trim().min(3).max(8),
    total_amount: z.union([z.number().finite(), z.string().trim().min(1)]),
    customer_first_name: z.string().trim().max(120).optional(),
    customer_last_name: z.string().trim().max(120).optional(),
    billing_email: z.string().trim().email().optional(),
    neutral_internal_note: z.string().trim().max(500).optional(),
    internal_metadata: z.record(z.string().min(1).max(80), metadataValueSchema).optional(),
  })
  .strict();

export type InternalOrderSyncPayload = z.infer<typeof internalOrderSyncSchema>;

export type SerializedQuickbooksInvoiceSync = {
  id: string;
  sourceSystem: string;
  sourceOrderId: string;
  sourceOrderNumber: string;
  billingEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  totalAmount: string;
  currency: string;
  invoiceStatus: string;
  qboCustomerId: string | null;
  qboInvoiceId: string | null;
  qboInvoiceDocNumber: string | null;
  invoiceEmailedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
  customerFacingPreview: {
    brandLabel: string;
    lineDescription: string;
  };
};

export class InternalOrderSyncError extends Error {
  httpStatus: number;
  syncId?: string;

  constructor(message: string, httpStatus = 500, syncId?: string) {
    super(message);
    this.name = "InternalOrderSyncError";
    this.httpStatus = httpStatus;
    this.syncId = syncId;
  }
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeBillingEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeAmount(value: number | string): Prisma.Decimal {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new InternalOrderSyncError("total_amount must be a positive number.", 400);
    }
    return new Prisma.Decimal(value.toFixed(2));
  }
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new InternalOrderSyncError("total_amount must be a positive decimal with up to two decimal places.", 400);
  }
  const decimal = new Prisma.Decimal(normalized);
  if (decimal.lte(0)) {
    throw new InternalOrderSyncError("total_amount must be greater than zero.", 400);
  }
  return decimal;
}

function assertSafeInternalNote(note: string | null) {
  if (note && UNSAFE_SOURCE_TEXT_PATTERN.test(note)) {
    throw new InternalOrderSyncError(
      "neutral_internal_note contains unsafe source-specific wording and was rejected.",
      400
    );
  }
}

function sanitizeInternalMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> | null {
  if (!metadata) return null;
  const next: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (UNSAFE_METADATA_KEY_PATTERN.test(key)) {
      throw new InternalOrderSyncError(`internal_metadata key '${key}' is not allowed.`, 400);
    }
    if (typeof value === "string" && UNSAFE_SOURCE_TEXT_PATTERN.test(value)) {
      throw new InternalOrderSyncError(
        `internal_metadata value for '${key}' contains unsafe source-specific wording.`,
        400
      );
    }
    next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : null;
}

export function validateInternalOrderSyncPayload(input: unknown) {
  const parsed = internalOrderSyncSchema.safeParse(input);
  if (!parsed.success) {
    throw new InternalOrderSyncError(parsed.error.issues[0]?.message ?? "Invalid order sync payload.", 400);
  }

  const billingEmail = normalizeBillingEmail(parsed.data.billing_email);
  const neutralInternalNote = normalizeOptionalText(parsed.data.neutral_internal_note);
  assertSafeInternalNote(neutralInternalNote);
  const internalMetadata = sanitizeInternalMetadata(parsed.data.internal_metadata);

  return {
    internalSource: parsed.data.internal_source.trim(),
    internalOrderId: parsed.data.internal_order_id.trim(),
    internalOrderNumber: parsed.data.internal_order_number.trim(),
    createdAt: parsed.data.created_at ? new Date(parsed.data.created_at) : null,
    currency: normalizeCurrency(parsed.data.currency),
    totalAmount: normalizeAmount(parsed.data.total_amount),
    customerFirstName: normalizeOptionalText(parsed.data.customer_first_name),
    customerLastName: normalizeOptionalText(parsed.data.customer_last_name),
    billingEmail,
    neutralInternalNote,
    internalMetadata,
    sanitizedPayload: {
      internal_source: parsed.data.internal_source.trim(),
      internal_order_id: parsed.data.internal_order_id.trim(),
      internal_order_number: parsed.data.internal_order_number.trim(),
      created_at: parsed.data.created_at ?? null,
      currency: normalizeCurrency(parsed.data.currency),
      total_amount: normalizeAmount(parsed.data.total_amount).toFixed(2),
      customer_first_name: normalizeOptionalText(parsed.data.customer_first_name),
      customer_last_name: normalizeOptionalText(parsed.data.customer_last_name),
      billing_email: billingEmail,
      neutral_internal_note: neutralInternalNote,
      internal_metadata: internalMetadata,
    } as Record<string, unknown>,
  };
}

function buildDedupeKey(firmId: string, sourceSystem: string, sourceOrderId: string) {
  return crypto
    .createHash("sha256")
    .update(`${firmId}:${sourceSystem}:${sourceOrderId}`)
    .digest("hex");
}

function buildQuickbooksRequestId(dedupeKey: string, suffix: string) {
  return `${suffix}-${dedupeKey}`.slice(0, 50);
}

function buildCustomerFacingPreview() {
  try {
    const env = getQuickbooksEnv();
    return {
      brandLabel: env.sourceLabel,
      lineDescription: env.defaultNeutralItemName,
    };
  } catch {
    return {
      brandLabel: "OnyxIntel",
      lineDescription: "OnyxIntel invoice",
    };
  }
}

export function assertOnyxOnlyCustomerFacingOutput(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    if (UNSAFE_SOURCE_TEXT_PATTERN.test(value)) {
      throw new InternalOrderSyncError("Unsafe source-specific wording reached a customer-facing QuickBooks field.", 500);
    }
  }
}

function serializeSyncRow(
  row: {
    id: string;
    sourceSystem: string;
    sourceOrderId: string;
    sourceOrderNumber: string;
    billingEmail: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    totalAmount: Prisma.Decimal;
    currency: string;
    invoiceStatus: QuickbooksInvoiceStatus;
    qboCustomerId: string | null;
    qboInvoiceId: string | null;
    qboInvoiceDocNumber: string | null;
    invoiceEmailedAt: Date | null;
    lastSyncError: string | null;
    createdAt: Date;
    updatedAt: Date;
    sanitizedPayload: Prisma.JsonValue;
  }
): SerializedQuickbooksInvoiceSync {
  return {
    id: row.id,
    sourceSystem: row.sourceSystem,
    sourceOrderId: row.sourceOrderId,
    sourceOrderNumber: row.sourceOrderNumber,
    billingEmail: row.billingEmail,
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    totalAmount: row.totalAmount.toFixed(2),
    currency: row.currency,
    invoiceStatus: row.invoiceStatus,
    qboCustomerId: row.qboCustomerId,
    qboInvoiceId: row.qboInvoiceId,
    qboInvoiceDocNumber: row.qboInvoiceDocNumber,
    invoiceEmailedAt: row.invoiceEmailedAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customerFacingPreview: buildCustomerFacingPreview(),
  };
}

async function getExistingInvoiceSync(firmId: string, sourceSystem: string, sourceOrderId: string) {
  return prisma.quickbooksInvoiceSync.findUnique({
    where: {
      firmId_sourceSystem_sourceOrderId: {
        firmId,
        sourceSystem,
        sourceOrderId,
      },
    },
  });
}

async function persistFailedSync(syncId: string, message: string) {
  return prisma.quickbooksInvoiceSync.update({
    where: { id: syncId },
    data: {
      invoiceStatus: QuickbooksInvoiceStatus.FAILED,
      lastSyncError: message,
    },
  });
}

async function processQuickbooksInvoiceSync(syncId: string, requestId?: string | null) {
  const sync = await prisma.quickbooksInvoiceSync.findUnique({ where: { id: syncId } });
  if (!sync) {
    throw new InternalOrderSyncError("QuickBooks invoice sync record not found.", 404, syncId);
  }

  const connection = await getQuickbooksConnectionStatus(sync.firmId);
  if (!connection.connected || !connection.integrationId) {
    const failed = await persistFailedSync(sync.id, "QuickBooks is not connected for this firm.");
    throw new InternalOrderSyncError(failed.lastSyncError ?? "QuickBooks is not connected.", 409, sync.id);
  }

  await prisma.quickbooksInvoiceSync.update({
    where: { id: sync.id },
    data: {
      integrationId: connection.integrationId,
    },
  });

  if (!sync.billingEmail?.trim()) {
    const failed = await persistFailedSync(sync.id, "Billing email is required before sending a QuickBooks invoice.");
    throw new InternalOrderSyncError(failed.lastSyncError ?? "Billing email is required.", 409, sync.id);
  }

  const customerRequestId = buildQuickbooksRequestId(sync.dedupeKey, "customer");
  const invoiceRequestId = buildQuickbooksRequestId(sync.dedupeKey, "invoice");
  const sendRequestId = buildQuickbooksRequestId(sync.dedupeKey, "send");

  try {
    let customer = await findQuickbooksCustomerByEmailOrName({
      firmId: sync.firmId,
      billingEmail: sync.billingEmail,
      firstName: sync.customerFirstName,
      lastName: sync.customerLastName,
      requestId: customerRequestId,
    });
    if (!customer) {
      customer = await createQuickbooksCustomer({
        firmId: sync.firmId,
        billingEmail: sync.billingEmail,
        firstName: sync.customerFirstName,
        lastName: sync.customerLastName,
        requestId: customerRequestId,
      });
    }

    const preview = buildCustomerFacingPreview();
    assertOnyxOnlyCustomerFacingOutput([
      preview.brandLabel,
      preview.lineDescription,
      sync.billingEmail,
    ]);

    const invoicePreviewPayload = buildNeutralQuickbooksInvoicePayload({
      customerId: customer.Id,
      billingEmail: sync.billingEmail,
      totalAmount: Number(sync.totalAmount.toString()),
      currency: sync.currency,
      neutralLineDescription: preview.lineDescription,
      itemId: "neutral-item-preview",
    });
    assertOnyxOnlyCustomerFacingOutput([
      invoicePreviewPayload.Line[0]?.Description,
      invoicePreviewPayload.BillEmail?.Address,
    ]);

    const invoice = await createQuickbooksInvoice({
      firmId: sync.firmId,
      customerId: customer.Id,
      billingEmail: sync.billingEmail,
      totalAmount: Number(sync.totalAmount.toString()),
      currency: sync.currency,
      requestId: invoiceRequestId,
    });

    await prisma.quickbooksInvoiceSync.update({
      where: { id: sync.id },
      data: {
        qboCustomerId: customer.Id,
        qboInvoiceId: invoice.Id,
        qboInvoiceDocNumber: invoice.DocNumber ?? null,
        invoiceStatus: QuickbooksInvoiceStatus.INVOICE_CREATED,
        lastSyncError: null,
      },
    });

    await sendQuickbooksInvoice({
      firmId: sync.firmId,
      invoiceId: invoice.Id,
      billingEmail: sync.billingEmail,
      requestId: sendRequestId,
    });

    const emailed = await prisma.quickbooksInvoiceSync.update({
      where: { id: sync.id },
      data: {
        qboCustomerId: customer.Id,
        qboInvoiceId: invoice.Id,
        qboInvoiceDocNumber: invoice.DocNumber ?? null,
        invoiceStatus: QuickbooksInvoiceStatus.EMAILED,
        invoiceEmailedAt: new Date(),
        lastSyncError: null,
      },
    });
    return emailed;
  } catch (error) {
    const safeMessage =
      error instanceof Error ? error.message : "QuickBooks invoice sync failed.";
    const failed = await persistFailedSync(sync.id, safeMessage);
    if (error instanceof InternalOrderSyncError) {
      throw error;
    }
    if (error instanceof QuickbooksApiError) {
      throw new InternalOrderSyncError(failed.lastSyncError ?? safeMessage, error.statusCode, sync.id);
    }
    throw new InternalOrderSyncError(failed.lastSyncError ?? safeMessage, 502, sync.id);
  }
}

export async function handleInternalOrderSync(params: {
  firmId: string;
  payload: unknown;
  requestId?: string | null;
}) {
  const validated = validateInternalOrderSyncPayload(params.payload);
  const dedupeKey = buildDedupeKey(params.firmId, validated.internalSource, validated.internalOrderId);

  const existing = await getExistingInvoiceSync(params.firmId, validated.internalSource, validated.internalOrderId);
  if (existing) {
    return {
      created: false,
      sync: serializeSyncRow(existing),
    };
  }

  let createdRow;
  try {
    createdRow = await prisma.quickbooksInvoiceSync.create({
      data: {
        firmId: params.firmId,
        sourceSystem: validated.internalSource,
        sourceOrderId: validated.internalOrderId,
        sourceOrderNumber: validated.internalOrderNumber,
        billingEmail: validated.billingEmail,
        customerFirstName: validated.customerFirstName,
        customerLastName: validated.customerLastName,
        totalAmount: validated.totalAmount,
        currency: validated.currency,
        sanitizedPayload: validated.sanitizedPayload as Prisma.InputJsonValue,
        dedupeKey,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await getExistingInvoiceSync(params.firmId, validated.internalSource, validated.internalOrderId);
      if (duplicate) {
        return {
          created: false,
          sync: serializeSyncRow(duplicate),
        };
      }
    }
    throw error;
  }

  const processed = await processQuickbooksInvoiceSync(createdRow.id, params.requestId);
  return {
    created: true,
    sync: serializeSyncRow(processed),
  };
}

export async function listQuickbooksInvoiceSyncs(firmId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = await prisma.quickbooksInvoiceSync.findMany({
    where: { firmId },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
  return rows.map((row) => serializeSyncRow(row));
}

export async function resendQuickbooksInvoiceSync(params: {
  firmId: string;
  syncId: string;
  requestId?: string | null;
}) {
  const row = await prisma.quickbooksInvoiceSync.findFirst({
    where: { id: params.syncId, firmId: params.firmId },
  });
  if (!row) {
    throw new InternalOrderSyncError("QuickBooks invoice sync record not found.", 404);
  }
  if (!row.qboInvoiceId) {
    throw new InternalOrderSyncError("No QuickBooks invoice exists yet for this order sync.", 409, row.id);
  }
  if (!row.billingEmail?.trim()) {
    const failed = await persistFailedSync(row.id, "Billing email is required before resending a QuickBooks invoice.");
    throw new InternalOrderSyncError(failed.lastSyncError ?? "Billing email is required.", 409, row.id);
  }

  await sendQuickbooksInvoice({
    firmId: params.firmId,
    invoiceId: row.qboInvoiceId,
    billingEmail: row.billingEmail,
    requestId: buildQuickbooksRequestId(row.dedupeKey, "resend"),
  });
  const updated = await prisma.quickbooksInvoiceSync.update({
    where: { id: row.id },
    data: {
      invoiceStatus: QuickbooksInvoiceStatus.EMAILED,
      invoiceEmailedAt: new Date(),
      lastSyncError: null,
    },
  });
  return serializeSyncRow(updated);
}

export async function getQuickbooksOpsSnapshot(firmId: string) {
  const [connection, syncs] = await Promise.all([
    getQuickbooksConnectionStatus(firmId),
    listQuickbooksInvoiceSyncs(firmId, 25),
  ]);

  return {
    connection,
    syncs,
    envStatus: getQuickbooksEnvStatus(),
  };
}

/**
 * Records request follow-up worker.
 * Run periodically; find SENT requests past dueAt or follow-up threshold;
 * send follow-up email if rule enabled; increment follow-up count; log event;
 * stop after maxFollowUps; mark FAILED or leave FOLLOW_UP_DUE when exhausted.
 */
import "dotenv/config";
import { prisma } from "../db/prisma";
import { buildFirmWhere } from "../lib/tenant";
import { sendAdapter } from "../send/compositeAdapter";
import { normalizeRecordsRequestStatus } from "../services/recordsRequestStatus";

const INTERVAL_MS = Number(process.env.RECORDS_REQUEST_FOLLOW_UP_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour

async function runOnce(): Promise<void> {
  const now = new Date();
  const rules = await prisma.recordsRequestFollowUpRule.findMany({
    where: { enabled: true },
  });
  for (const rule of rules) {
    const firmId = rule.firmId;
    const sentRequests = await prisma.recordsRequest.findMany({
      where: {
        ...buildFirmWhere(firmId),
        status: { in: ["SENT", "FOLLOW_UP_DUE"] },
      },
      take: 50,
    });
    for (const req of sentRequests) {
      const normalizedStatus = normalizeRecordsRequestStatus(req.status, "SENT");
      const effectiveSentAt = req.sentAt ?? req.requestDate ?? req.createdAt;
      if (req.status !== normalizedStatus || req.sentAt == null) {
        await prisma.recordsRequest.update({
          where: { id: req.id },
          data: {
            status: normalizedStatus,
            ...(req.sentAt == null ? { sentAt: effectiveSentAt, requestDate: req.requestDate ?? effectiveSentAt } : {}),
          },
        });
      }
      const maxFollowUps = rule.maxFollowUps ?? 3;
      const count = req.followUpCount ?? 0;
      if (count >= maxFollowUps) {
        await prisma.recordsRequest.update({
          where: { id: req.id },
          data: { status: "FAILED" },
        });
        await prisma.recordsRequestEvent.create({
          data: {
            firmId,
            recordsRequestId: req.id,
            eventType: "FAILED",
            status: "FAILED",
            message: "Max follow-ups reached",
            metaJson: { followUpCount: count, maxFollowUps },
          },
        });
        continue;
      }
      const dest = (req.destinationValue ?? "").trim();
      if (!dest) continue;
      const daysSinceSend = effectiveSentAt
        ? Math.floor((now.getTime() - effectiveSentAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      if (daysSinceSend < rule.daysAfterSend) continue;
      if (normalizedStatus !== "FOLLOW_UP_DUE") {
        await prisma.recordsRequest.update({
          where: { id: req.id },
          data: { status: "FOLLOW_UP_DUE" },
        });
        await prisma.recordsRequestEvent.create({
          data: {
            firmId,
            recordsRequestId: req.id,
            eventType: "FOLLOW_UP_DUE",
            status: "FOLLOW_UP_DUE",
            message: "Request is due for follow-up",
            metaJson: { sentAt: effectiveSentAt.toISOString(), daysSinceSend },
          },
        });
      }
      const lastFollowUp = req.lastFollowUpAt;
      const daysSinceLastFollowUp = lastFollowUp
        ? Math.floor((now.getTime() - lastFollowUp.getTime()) / (24 * 60 * 60 * 1000))
        : daysSinceSend;
      if (lastFollowUp && daysSinceLastFollowUp < rule.daysAfterSend) continue;

      const subject = `Follow-up: ${req.subject ?? "Medical Records Request"}`;
      const body =
        rule.messageTemplate?.trim() ||
        req.messageBody ||
        "Please send the requested records at your earliest convenience. Thank you.";
      const result = await sendAdapter.sendEmail(dest, subject, body);
      const followUpCount = count + 1;
      await prisma.recordsRequest.update({
        where: { id: req.id },
        data: {
          followUpCount,
          lastFollowUpAt: now,
          status: followUpCount >= maxFollowUps ? "FAILED" : "FOLLOW_UP_DUE",
        },
      });
      await prisma.recordsRequestEvent.create({
        data: {
          firmId,
          recordsRequestId: req.id,
          eventType: result.ok ? "FOLLOW_UP_SENT" : "FAILED",
          status: result.ok ? "FOLLOW_UP_DUE" : "FAILED",
          message: result.ok ? "Follow-up sent" : (result.error ?? "Send failed"),
          metaJson: { followUpCount, ok: result.ok },
        },
      });
    }
  }
}

async function run() {
  console.log("[records-request-follow-up] started", { intervalMs: INTERVAL_MS });
  try {
    await runOnce();
  } catch (e) {
    console.error("[records-request-follow-up] runOnce error", e);
  }
  setInterval(async () => {
    try {
      await runOnce();
    } catch (e) {
      console.error("[records-request-follow-up] runOnce error", e);
    }
  }, INTERVAL_MS);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

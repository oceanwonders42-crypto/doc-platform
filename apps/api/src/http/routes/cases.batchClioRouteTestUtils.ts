import type { AddressInfo } from "node:net";

import JSZip from "jszip";
import type { Express } from "express";
import type { Server } from "node:http";

export const ROUTE_PATH = "/cases/exports/clio/batch";
export const SUCCESS_CASE_IDS = ["demo-case-2", "demo-case-1", "demo-case-4", "missing-case"];

export type BatchClioRouteManifest = {
  includedCaseIds: string[];
  includedCaseNumbers: string[];
  reexportedCaseIds?: string[];
  reexportedCaseNumbers?: string[];
  skippedCases: Array<{ id: string; reason: string }>;
  contactsRowCount: number;
  mattersRowCount: number;
  exportTimestamp: string;
};

export function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export function getHeader(response: Response, name: string): string {
  const value = response.headers.get(name);
  assert(typeof value === "string" && value.length > 0, `Expected ${name} response header`);
  return value!;
}

export async function parseZip(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(buffer.length > 0, "ZIP response body should be non-empty.");
  return JSZip.loadAsync(buffer);
}

export function extractZipDatePart(contentDisposition: string): string {
  const fileNameMatch = contentDisposition.match(/filename="(clio-handoff-batch-(\d{4}-\d{2}-\d{2})\.zip)"/);
  assert(!!fileNameMatch, `Unexpected content-disposition header: ${contentDisposition}`);
  return fileNameMatch![2];
}

export async function startTestServer(app: Express): Promise<{ baseUrl: string; server: Server }> {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

export async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

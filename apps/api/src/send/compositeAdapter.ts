import type { SendAdapter } from "./types";
import * as smtpAdapter from "./adapters/smtpEmailAdapter";
import * as faxAdapter from "./adapters/faxAdapter";

/**
 * Composite adapter that delegates email to SMTP and fax to fax stub.
 * Both methods are available; fax returns error until provider is implemented.
 */
export const sendAdapter: SendAdapter = {
  async sendEmail(to, subject, body, attachments) {
    return smtpAdapter.sendEmail(to, subject, body, attachments);
  },
  async sendFax(toFax, pdfBuffer) {
    return faxAdapter.sendFax(toFax, pdfBuffer);
  },
};

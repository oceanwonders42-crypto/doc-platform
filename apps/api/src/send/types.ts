export type SendAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export interface SendAdapter {
  sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: SendAttachment[]
  ): Promise<{ ok: boolean; error?: string }>;
  sendFax(toFax: string, pdfBuffer: Buffer): Promise<{ ok: boolean; error?: string }>;
}

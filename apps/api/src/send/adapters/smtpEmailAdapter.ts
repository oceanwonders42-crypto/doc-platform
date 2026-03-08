import nodemailer from "nodemailer";
import type { SendAttachment } from "../types";

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";

  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user || pass ? { user, pass } : undefined,
  });
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: SendAttachment[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      return { ok: false, error: "SMTP not configured. Set SMTP_HOST and optionally SMTP_USER, SMTP_PASS." };
    }
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@example.com";

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to,
      subject,
      text: body,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    };

    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Fax adapter stub. Env SEND_FAX_PROVIDER can be "twilio" or "srfax" for future implementation.
 * Currently returns error indicating fax is not configured.
 */
export async function sendFax(
  _toFax: string,
  _pdfBuffer: Buffer
): Promise<{ ok: boolean; error?: string }> {
  const provider = process.env.SEND_FAX_PROVIDER ?? "";
  if (!provider || !["twilio", "srfax"].includes(provider.toLowerCase())) {
    return {
      ok: false,
      error: "Fax not configured. Set SEND_FAX_PROVIDER=twilio or srfax and provider-specific env vars.",
    };
  }
  // Placeholder for future Twilio/SRFax integration
  return {
    ok: false,
    error: `Fax provider "${provider}" is not yet implemented. Coming soon.`,
  };
}

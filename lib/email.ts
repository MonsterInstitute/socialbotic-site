/**
 * Transactional confirmation email via Resend (https://resend.com).
 *
 * Sent from the verified socialbotic.com domain (default hello@socialbotic.com).
 * Without RESEND_API_KEY this is a silent no-op — the subscription still
 * succeeds. A failed send is logged, never thrown, so it can't fail the request.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.RESEND_FROM || "Socialbotic <hello@socialbotic.com>";
}

export async function sendSubscriberConfirmation(email: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // no key configured → skip silently

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [email],
        subject: "You're on the early-access list.",
        text: [
          "You're on the Socialbotic early-access list.",
          "",
          "We'll email you the moment there's something to try — new platforms,",
          "early access, and launch news. No spam, and you can unsubscribe anytime.",
          "",
          "— Socialbotic",
          "https://socialbotic.com",
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[resend] confirmation send failed:", res.status, body);
    }
  } catch (err) {
    console.error("[resend] confirmation send errored:", err);
  }
}

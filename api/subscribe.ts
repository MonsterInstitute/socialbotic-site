import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { getSupabase, hasSupabase } from "../lib/supabase";
import { sendSubscriberConfirmation } from "../lib/email";
import { clientIp, rateLimited } from "../lib/rateLimit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.enum(["landing_hero", "landing_footer"]),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (rateLimited(clientIp(req.headers))) {
    return res
      .status(429)
      .json({ error: "Too many requests — please try again in a bit." });
  }

  // @vercel/node parses JSON bodies; tolerate a raw string too.
  let raw: unknown = req.body;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "Invalid request." });
    }
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Please enter a valid email address." });
  }

  if (!hasSupabase()) {
    return res
      .status(503)
      .json({ error: "Signups open shortly — please check back in a bit." });
  }

  const { email, source } = parsed.data;
  const supabase = getSupabase();

  // Idempotent opt-in. Try to insert; a unique-violation (23505) means the email
  // is already on the list, so we update its source and re-activate it. `created`
  // is true only on a fresh insert, so the confirmation email fires exactly once.
  let created: boolean;
  const insert = await supabase
    .from("subscribers")
    .insert({ email, source })
    .select("id")
    .single();

  if (insert.error) {
    if (insert.error.code === "23505") {
      const update = await supabase
        .from("subscribers")
        .update({ source, unsubscribed_at: null })
        .eq("email", email);
      if (update.error) {
        console.error("[subscribe] update failed:", update.error);
        return res
          .status(500)
          .json({ error: "Something went wrong on our end — please try again." });
      }
      created = false;
    } else {
      console.error("[subscribe] insert failed:", insert.error);
      return res
        .status(500)
        .json({ error: "Something went wrong on our end — please try again." });
    }
  } else {
    created = true;
  }

  // Confirmation email only on first insert; silent no-op without a Resend key.
  if (created) {
    await sendSubscriberConfirmation(email);
  }

  return res.status(200).json({ ok: true, already: !created });
}

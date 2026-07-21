import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase, hasSupabase } from "../../lib/supabase";

/**
 * Token-gated read of the early-access list. Pass the shared secret as either an
 * `x-admin-token` header or a `?token=` query param; it must equal
 * SUBSCRIBE_ADMIN_TOKEN. Returns the total, per-source counts, and the rows
 * (optionally filtered by `?source=`). No public backend exists on the static
 * site, so this is the "simple protected endpoint" for subscriber visibility.
 */
const SOURCES = ["landing_hero", "landing_footer"] as const;

function tokenFrom(req: VercelRequest): string {
  const header = req.headers["x-admin-token"];
  const h = Array.isArray(header) ? header[0] : header;
  if (h) return h.trim();
  const q = req.query.token;
  return (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.SUBSCRIBE_ADMIN_TOKEN ?? "";
  if (!expected || tokenFrom(req) !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!hasSupabase()) {
    return res
      .status(503)
      .json({ error: "SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured." });
  }

  const supabase = getSupabase();
  const sourceParam = req.query.source;
  const source = Array.isArray(sourceParam) ? sourceParam[0] : sourceParam;

  try {
    let listQuery = supabase
      .from("subscribers")
      .select("email, source, created_at, unsubscribed_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (source) listQuery = listQuery.eq("source", source);

    const list = await listQuery;
    if (list.error) throw list.error;

    // Exact counts via head requests (independent of the 1000-row list cap).
    const totalRes = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true });
    if (totalRes.error) throw totalRes.error;

    const bySource: Record<string, number> = {};
    for (const s of SOURCES) {
      const r = await supabase
        .from("subscribers")
        .select("*", { count: "exact", head: true })
        .eq("source", s);
      if (r.error) throw r.error;
      bySource[s] = r.count ?? 0;
    }

    return res.status(200).json({
      total: totalRes.count ?? 0,
      bySource,
      count: list.data?.length ?? 0,
      subscribers: list.data ?? [],
    });
  } catch (err) {
    console.error("[admin/subscribers] query failed:", err);
    return res.status(500).json({ error: "Query failed." });
  }
}

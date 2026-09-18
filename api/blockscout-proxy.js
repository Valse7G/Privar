// v21.2.5 — server-side proxy for Arc Testnet's Blockscout API.
//
// ROOT CAUSE this fixes: the browser console logs showed every single
// request to https://testnet.arcscan.app/api failing with
// "has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
// is present" — testnet.arcscan.app's API does not send CORS headers
// allowing browser requests from privar.vercel.app (or any other origin).
// That is a server-side configuration on Blockscout's end that this
// frontend cannot change or bypass from client-side JS — CORS is enforced
// by the BROWSER based on the RESPONSE headers from that server, no request
// header or fetch option can work around it.
//
// The result, before this fix: EVERY fetchLogsViaBlockscout() call (and the
// getcontractcreation lookup added in v21.2.0) failed 100% of the time,
// silently forcing 100% of this app's log-scanning traffic onto the
// expensive, tightly-chunked raw eth_getLogs RPC fallback — which is far
// too slow to keep up (see the "867,940 blocks remaining" log line) and
// triggers constant "Request limit exceeded" cascades across every
// background scanner at once. This one broken integration is very likely
// the dominant cause of the cross-device sync failures reported across this
// whole thread, not any of the individual scan-logic bugs fixed so far
// (those were all real, but downstream of this).
//
// The fix: a request FROM THIS SERVER to testnet.arcscan.app is a normal
// server-to-server HTTP call — CORS is a browser-only concept and does not
// apply here. The frontend now calls this same-origin endpoint
// (/api/blockscout-proxy) instead of testnet.arcscan.app directly; this
// function forwards the query string server-side and relays the response.
//
// Vercel deploys any file under /api/*.js as a serverless function
// automatically. See vercel.json — its SPA catch-all rewrite was updated to
// exclude /api/* explicitly so it can never shadow this route.

const ARCSCAN_API_BASE = "https://testnet.arcscan.app/api";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ error: "GET only" }); return; }

  try {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const upstream = await fetch(`${ARCSCAN_API_BASE}${qs}`, {
      headers: { Accept: "application/json" },
    });
    const bodyText = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    // Short cache: this is read-only, idempotent blockchain data (logs up to
    // a given block, or a fixed contract-creation fact) — a few seconds of
    // shared CDN caching costs nothing in correctness and takes real load
    // off both this function and the upstream Blockscout instance when
    // multiple devices/tabs happen to poll at the same moment.
    res.setHeader("Cache-Control", "public, max-age=5, s-maxage=5, stale-while-revalidate=30");
    res.send(bodyText);
  } catch (e) {
    res.status(502).json({ error: "blockscout-proxy: upstream fetch failed", detail: String(e?.message || e) });
  }
}

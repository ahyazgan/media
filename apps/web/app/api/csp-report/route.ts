import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

/** CSP ihlal raporları (Report-Only modunda bile gelir). Sunucu günlüğüne kısaltılmış yazılır; ters vekilde toplanabilir. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "csp", 30);
  if (limited) return limited;
  const text = (await req.text()).slice(0, 4000);
  try {
    const r = JSON.parse(text) as { "csp-report"?: Record<string, unknown> } | { body?: Record<string, unknown> }[];
    const body = Array.isArray(r) ? r[0]?.body : r["csp-report"];
    console.warn("[csp]", JSON.stringify({ doc: body?.["document-uri"] ?? body?.["documentURL"], blocked: body?.["blocked-uri"] ?? body?.["blockedURL"], directive: body?.["violated-directive"] ?? body?.["effectiveDirective"] }));
  } catch { console.warn("[csp] ayrıştırılamayan rapor"); }
  return new NextResponse(null, { status: 204 });
}

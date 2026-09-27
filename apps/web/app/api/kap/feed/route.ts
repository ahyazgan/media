import { NextResponse } from "next/server";
import { kapFeed } from "@/lib/queries";

/** Ana sayfadaki canlı KAP akışı 30 sn'de bir buradan çeker (şartname §3). CDN 15 sn önbellekler. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const items = await kapFeed(limit);
  return NextResponse.json({ items, updatedAt: new Date().toISOString() }, {
    headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}

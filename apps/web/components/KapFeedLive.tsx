"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KapFeed, type KapFeedItem } from "@kaynak/ui";

const NextLink = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => <Link href={href} className={className}>{children}</Link>;

/**
 * Sunucudan gelen ilk listeyle açılır; sekme görünürken 30 sn'de bir /api/kap/feed'den yeniler (şartname: 30 sn polling).
 * Ağ hatasında son liste ekranda kalır.
 */
export function KapFeedLive({ initial, intervalMs = 30_000, limit = 12 }: { initial: KapFeedItem[]; intervalMs?: number; limit?: number }) {
  const [items, setItems] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/kap/feed?limit=${limit}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: KapFeedItem[]; updatedAt: string };
        if (!stopped) { setItems(data.items); setUpdatedAt(data.updatedAt); }
      } catch { /* ağ hatası: son liste kalır */ }
    };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [intervalMs, limit]);

  return <KapFeed items={items} updatedAt={updatedAt} limit={limit} LinkComponent={NextLink} />;
}

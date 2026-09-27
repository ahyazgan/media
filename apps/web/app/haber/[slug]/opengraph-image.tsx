import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { categoryLabel } from "@kaynak/ui";
import { articleBySlug } from "@/lib/queries";
import { dateLabel } from "@/lib/format";

export const alt = "Kaynak haber görseli";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

/** Fontlar depoda (apps/web/assets/fonts, OFL); çalışma dizini apps/web ya da kök olabilir. */
async function font(name: string): Promise<ArrayBuffer | null> {
  for (const base of [process.cwd(), join(process.cwd(), "apps", "web")]) {
    const p = join(base, "assets", "fonts", name);
    if (existsSync(p)) { const b = await readFile(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; }
  }
  return null;
}

/** Şartname §8: OG görseli — Fuşya token'larıyla başlık + kategori + logo; Discover için 1200 px. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await articleBySlug(slug);
  const title = r?.article.title ?? "Kaynak";
  const category = r ? categoryLabel(r.article.category) : "";
  const date = r?.article.publishedAt ? dateLabel(r.article.publishedAt) : "";
  const [dm, dmB, fr] = await Promise.all([font("dm-sans-400.ttf"), font("dm-sans-700.ttf"), font("fraunces-800.ttf")]);
  const fonts = [dm && { name: "DM Sans", data: dm, weight: 400 as const }, dmB && { name: "DM Sans", data: dmB, weight: 700 as const }, fr && { name: "Fraunces", data: fr, weight: 800 as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 700 | 800 }[];
  const fs = title.length > 90 ? 48 : title.length > 60 ? 56 : 64;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#FFFFFF", color: "#1A1826", fontFamily: fonts.length ? "DM Sans" : "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#E0187B" }}>
          <span>{category}</span><span style={{ color: "#7A7388", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>{date}</span>
        </div>
        <div style={{ display: "flex", fontFamily: fr ? "Fraunces" : "serif", fontWeight: 800, fontSize: fs, lineHeight: 1.12, letterSpacing: -1 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: fr ? "Fraunces" : "serif", fontWeight: 800, fontSize: 56 }}>Kaynak<span style={{ color: "#E0187B" }}>.</span></div>
            <div style={{ fontSize: 24, color: "#7A7388" }}>Resmi kaynaktan, dakikalar içinde, doğrulanmış.</div>
          </div>
          <div style={{ display: "flex", width: 160, height: 12, background: "#E0187B", borderRadius: 6 }} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

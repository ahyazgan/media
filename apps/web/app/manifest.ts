import type { MetadataRoute } from "next";

/** Şartname §7 — /manifest.webmanifest. share_target: paylaşılan URL/metin /ara sayfasına düşer. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kaynak — Resmi kaynaktan, dakikalar içinde, doğrulanmış",
    short_name: "Kaynak",
    description: "Resmi Gazete, KAP, TCMB ve TÜİK bildirimlerini dakikalar içinde doğrulanmış habere çeviren ekonomi haber sitesi.",
    start_url: "/?utm_source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "tr",
    theme_color: "#E0187B",
    background_color: "#FFFFFF",
    categories: ["news", "finance", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Resmi Gazete", url: "/resmi-gazete", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Makro takvim", url: "/takvim", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Şirketler", url: "/sirket", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    // MetadataRoute.Manifest tipinde share_target yok; Web App Manifest'te standarttır.
    ...({ share_target: { action: "/ara", method: "GET", params: { title: "title", text: "text", url: "url" } } } as Record<string, unknown>),
  };
}

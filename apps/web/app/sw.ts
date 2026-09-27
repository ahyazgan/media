/// <reference lib="webworker" />
/**
 * Service worker (Serwist). Şartname §7:
 *  - uygulama kabuğu precache (Serwist manifest'i)
 *  - /api/* network-first + 1 saatlik önbellek
 *  - ana sayfa ve son 50 haber çevrimdışı okunabilir (network-first, 51 girdi)
 *  - görseller stale-while-revalidate
 *  - web push: bildirim göster, tıklamada haberi aç
 */
import { defaultCache } from "@serwist/next/worker";
import { ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({ cacheName: "api", networkTimeoutSeconds: 10, plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 3600 })] }),
    },
    {
      matcher: ({ request, url, sameOrigin }) => sameOrigin && request.mode === "navigate" && (url.pathname === "/" || url.pathname.startsWith("/haber/")),
      handler: new NetworkFirst({ cacheName: "pages-offline", networkTimeoutSeconds: 10, plugins: [new ExpirationPlugin({ maxEntries: 51, maxAgeSeconds: 7 * 86400 })] }),
    },
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new StaleWhileRevalidate({ cacheName: "images", plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 86400 })] }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher({ request }) { return request.destination === "document"; } }],
  },
});
serwist.addEventListeners();

interface PushData { title?: string; body?: string; url?: string; tag?: string; category?: string }

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try { data = (event.data?.json() as PushData) ?? {}; } catch { data = { title: "Kaynak", body: event.data?.text() ?? "" }; }
  event.waitUntil(self.registration.showNotification(data.title ?? "Kaynak", {
    body: data.body ?? "", icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: data.tag, data: { url: data.url ?? "/" }, lang: "tr",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("navigate" in c) { await c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});

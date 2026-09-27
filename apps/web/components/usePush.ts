"use client";
import { useCallback, useEffect, useState } from "react";

export type PushState = "unsupported" | "blocked" | "ios-needs-install" | "off" | "subscribed" | "loading";

function b64ToU8(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/**
 * Push aboneliği durumu ve işlemleri (PwaClient ilk izin akışı ve /bildirimler tercih sayfası ortak kullanır).
 * Sunucu: /api/push/vapid (açık anahtar), /api/push/subscribe (POST kayıt/güncelle, DELETE iptal).
 */
export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [vapid, setVapid] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    if (isIos() && !isStandalone()) { setState("ios-needs-install"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    const res = await fetch("/api/push/vapid").catch(() => null);
    if (!res || !res.ok) { setState("unsupported"); return; }
    const { publicKey } = (await res.json()) as { publicKey: string };
    setVapid(publicKey);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setEndpoint(sub?.endpoint ?? null);
    setState(sub ? "subscribed" : "off");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  /** İzin ister (gerekirse), abone olur ya da kategorileri günceller. Hata mesajı döndürür; başarıda boş. */
  const subscribe = useCallback(async (categories: string[], consent: boolean): Promise<string> => {
    if (!vapid) return "Push kapalı.";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setState("blocked"); return "Tarayıcı izni verilmedi."; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapid) as BufferSource }));
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), categories, consent }) });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Kayıt başarısız.";
    setEndpoint(sub.endpoint); setState("subscribed");
    return "";
  }, [vapid]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
    setEndpoint(null); setState("off");
  }, []);

  return { state, endpoint, subscribe, unsubscribe, refresh };
}

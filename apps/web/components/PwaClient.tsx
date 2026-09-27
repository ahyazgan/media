"use client";
import { useEffect, useState } from "react";
import { CookieBar, InstallBanner, PushOptIn, Toast } from "@kaynak/ui";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const LS = { install: "k-install-dismissed", cookie: "k-cookie", push: "k-push-state" };
const day = 86_400_000;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* özel pencere */ } };

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function b64ToU8(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * PWA istemci akışı (şartname §7): çerez barı; kurulum bandı (iOS: adımlar, Android/masaüstü: beforeinstallprompt);
 * push izni yalnızca push destekleniyorsa ve iOS'ta ancak ana ekrana eklendikten sonra istenir.
 */
export function PwaClient() {
  const [cookie, setCookie] = useState<string | null>("pending");
  const [install, setInstall] = useState<"ios" | "prompt" | null>(null);
  const [bip, setBip] = useState<BeforeInstallPromptEvent | null>(null);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [vapid, setVapid] = useState<string | null>(null);
  const [cats, setCats] = useState<string[]>(["makro", "borsa"]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    setCookie(read(LS.cookie));
    const dismissed = Number(read(LS.install) ?? 0);
    const standalone = isStandalone();
    if (!standalone && Date.now() - dismissed > 30 * day) {
      if (isIos()) setInstall("ios");
      const onBip = (e: Event) => { e.preventDefault(); setBip(e as BeforeInstallPromptEvent); setInstall("prompt"); };
      window.addEventListener("beforeinstallprompt", onBip);
      return () => window.removeEventListener("beforeinstallprompt", onBip);
    }
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported || Notification.permission !== "default" || read(LS.push) === "done") return;
    if (isIos() && !isStandalone()) return; // iOS'ta push yalnızca ana ekrana eklenmiş PWA'da
    fetch("/api/push/vapid").then((r) => (r.ok ? r.json() : null)).then((d: { publicKey?: string } | null) => { if (d?.publicKey) { setVapid(d.publicKey); setPushAvailable(true); } }).catch(() => {});
  }, []);

  const subscribe = async () => {
    if (!vapid) return;
    setBusy(true); setErr("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setErr("Tarayıcı izni verilmedi."); write(LS.push, "done"); setPushAvailable(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapid) as BufferSource });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), categories: cats, consent }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "kayıt başarısız" }))).error);
      write(LS.push, "done"); setPushAvailable(false); setToast("Bildirimler açık."); setTimeout(() => setToast(""), 4000);
    } catch (e) { setErr((e as Error).message || "Abonelik başarısız."); }
    finally { setBusy(false); }
  };

  return (
    <>
      {cookie === null && <CookieBar
        onEssential={() => { write(LS.cookie, "essential"); setCookie("essential"); window.dispatchEvent(new CustomEvent("k-consent", { detail: "essential" })); }}
        onAccept={() => { write(LS.cookie, "all"); setCookie("all"); window.dispatchEvent(new CustomEvent("k-consent", { detail: "all" })); }} />}
      {install && cookie !== null && (
        <InstallBanner mode={install} onDismiss={() => { write(LS.install, String(Date.now())); setInstall(null); }}
          onInstall={async () => { if (!bip) return; await bip.prompt(); const c = await bip.userChoice; if (c.outcome === "accepted") setInstall(null); }} />
      )}
      {pushAvailable && cookie !== null && !install && (
        <div className="k-container" style={{ marginTop: 8 }}>
          <PushOptIn categories={cats} onToggle={(id) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))} consent={consent} onConsent={setConsent} onSubmit={subscribe} busy={busy} error={err} />
        </div>
      )}
      {toast && <Toast>{toast}</Toast>}
    </>
  );
}

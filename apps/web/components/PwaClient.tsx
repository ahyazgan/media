"use client";
import { useEffect, useState } from "react";
import { CookieBar, InstallBanner, PushOptIn, Toast } from "@kaynak/ui";
import { isIos, isStandalone, usePush } from "./usePush";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const LS = { install: "k-install-dismissed", cookie: "k-cookie", push: "k-push-state" };
const day = 86_400_000;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* özel pencere */ } };


/**
 * PWA istemci akışı (şartname §7): çerez barı; kurulum bandı (iOS: adımlar, Android/masaüstü: beforeinstallprompt);
 * push izni yalnızca push destekleniyorsa ve iOS'ta ancak ana ekrana eklendikten sonra istenir.
 */
export function PwaClient() {
  const [cookie, setCookie] = useState<string | null>("pending");
  const [install, setInstall] = useState<"ios" | "prompt" | null>(null);
  const [bip, setBip] = useState<BeforeInstallPromptEvent | null>(null);
  const push = usePush();
  const [pushDone, setPushDone] = useState(false);
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

  useEffect(() => { setPushDone(read(LS.push) === "done"); }, []);
  // İlk izin kutusu: push destekleniyor, henüz sorulmamış (iOS'ta yalnızca ana ekrana eklenmiş PWA'da)
  const pushAvailable = push.state === "off" && !pushDone;

  const subscribe = async () => {
    setBusy(true); setErr("");
    const e = await push.subscribe(cats, consent);
    setBusy(false);
    if (e) { setErr(e); if (push.state === "blocked") { write(LS.push, "done"); setPushDone(true); } return; }
    try { localStorage.setItem("k-push-categories", JSON.stringify(cats)); } catch { /* yok */ }
    write(LS.push, "done"); setPushDone(true); setToast("Bildirimler açık. Tercihler: /bildirimler"); setTimeout(() => setToast(""), 5000);
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

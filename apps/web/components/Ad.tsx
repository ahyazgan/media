"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AdSlot } from "@kaynak/ui";
import { AD_SLOTS, CONSENT_EVENT, adConfig, readConsent, type AdSlotId, type Consent } from "@/lib/ads";

declare global {
  interface Window { adsbygoogle?: unknown[]; googletag?: { cmd: (() => void)[]; [k: string]: unknown } }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true; s.crossOrigin = "anonymous";
      for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
      s.onload = () => resolve(); s.onerror = () => reject(new Error(`script yüklenemedi: ${src}`));
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

/** Çerez rızasını izler: localStorage + PwaClient'ın yaydığı k-consent olayı. */
function useConsent(): Consent {
  const [c, setC] = useState<Consent>(null);
  useEffect(() => {
    setC(readConsent());
    const on = (e: Event) => setC(((e as CustomEvent).detail as Consent) ?? readConsent());
    window.addEventListener(CONSENT_EVENT, on);
    window.addEventListener("storage", () => setC(readConsent()));
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, []);
  return c;
}

/**
 * Rıza kapılı reklam slotu. Rıza yoksa ya da sağlayıcı/birim tanımlı değilse yalnızca sabit boyutlu yer tutucu (CLS yok,
 * script yok). "Kabul et" sonrası sağlayıcı scripti bir kez yüklenir ve reklam kutunun içinde gösterilir.
 */
export function Ad({ id, label = "Reklam" }: { id: AdSlotId; label?: "Reklam" | "Sponsorlu" }) {
  const slot = AD_SLOTS[id];
  const cfg = adConfig();
  const unit = cfg.units[id];
  const consent = useConsent();
  const active = consent === "all" && cfg.provider !== "none" && Boolean(unit);
  const divId = `k-ad-${id}-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const ref = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(window.innerWidth < 960); }, []);
  const [w = 300, h = 250] = (mobile ? slot.mobileSize : slot.size).split("x").map(Number);

  useEffect(() => {
    if (!active || !unit) return;
    let cancelled = false;
    if (cfg.provider === "adsense") {
      loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.adsenseClient!)}`).then(() => {
        if (cancelled) return;
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { console.warn("[ad] adsense", (e as Error).message); }
      }).catch((e) => console.warn("[ad]", (e as Error).message));
    } else if (cfg.provider === "gam") {
      loadScript("https://securepubads.g.doubleclick.net/tag/js/gpt.js").then(() => {
        if (cancelled) return;
        const gt = (window.googletag = window.googletag || { cmd: [] });
        gt.cmd.push(() => {
          const g = window.googletag as unknown as {
            defineSlot: (p: string, s: [number, number], d: string) => { addService: (x: unknown) => void } | null;
            pubads: () => { enableSingleRequest: () => void; collapseEmptyDivs: (b: boolean) => void; setPrivacySettings: (o: Record<string, boolean>) => void };
            enableServices: () => void; display: (d: string) => void; pubadsReady?: boolean;
          };
          const s = g.defineSlot(`${cfg.gamNetwork}/${unit}`, [w, h], divId);
          if (!s) return;
          s.addService(g.pubads());
          if (!g.pubadsReady) { g.pubads().enableSingleRequest(); g.pubads().collapseEmptyDivs(false); g.enableServices(); }
          g.display(divId);
        });
      }).catch((e) => console.warn("[ad]", (e as Error).message));
    }
    return () => { cancelled = true; };
  }, [active, unit, cfg.provider, cfg.adsenseClient, cfg.gamNetwork, divId, w, h]);

  return (
    <AdSlot id={id} size={slot.size} mobileSize={slot.mobileSize} label={label}>
      {active && cfg.provider === "adsense" && (
        <ins className="adsbygoogle" style={{ display: "inline-block", width: w, height: h }} data-ad-client={cfg.adsenseClient} data-ad-slot={unit} data-full-width-responsive="false" />
      )}
      {active && cfg.provider === "gam" && <div id={divId} ref={ref} style={{ width: w, height: h }} />}
    </AdSlot>
  );
}

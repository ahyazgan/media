"use client";
import { useReportWebVitals } from "next/web-vitals";

/**
 * Core Web Vitals toplama (şartname Faz 5 kabul: CLS < 0,1, LCP < 2,5 s mobil). Oturum başına %10 örnekleme,
 * sendBeacon ile /api/vitals; admin panosunda 7 günlük p75 gösterilir. Kişisel veri yok (yol + değer + cihaz sınıfı).
 */
const SAMPLE = 0.1;
function sampled(): boolean {
  try {
    const k = "k-vitals";
    let v = sessionStorage.getItem(k);
    if (!v) { v = Math.random() < SAMPLE ? "1" : "0"; sessionStorage.setItem(k, v); }
    return v === "1";
  } catch { return false; }
}

export function Vitals() {
  useReportWebVitals((m) => {
    if (!["LCP", "CLS", "INP", "FCP", "TTFB"].includes(m.name) || !sampled()) return;
    const body = JSON.stringify({ name: m.name, value: m.value, rating: m.rating, path: location.pathname.replace(/\/haber\/.*/, "/haber/[slug]").slice(0, 120), mobile: window.innerWidth < 768 });
    try { if (!navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }))) void fetch("/api/vitals", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }); } catch { /* yut */ }
  });
  return null;
}

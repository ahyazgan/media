"use client";
import { useEffect, useState } from "react";
import { Ad } from "./Ad";

/** Şartname §6.3: PWA'da sekme çubuğu üstü 320×50. Yalnızca standalone modda ve akış içinde (sabit/kayan değil — Better Ads). */
export function TabBarAd() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => { setStandalone(window.matchMedia("(display-mode: standalone)").matches); }, []);
  if (!standalone) return null;
  return <div className="k-container" style={{ paddingBottom: 8 }}><Ad id="tabbar-top" /></div>;
}

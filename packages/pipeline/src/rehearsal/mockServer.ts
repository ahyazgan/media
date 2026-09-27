/**
 * Prova için sahte kaynak + Telegram sunucusu. Fixture'ları gerçek sitelerin adres şemasıyla sunar:
 *  - Resmi Gazete: /eskiler/YYYY/MM/YYYYMMDD.htm (istenen güne uyarlanmış fihrist), /eskiler/.../YYYYMMDD-N.htm (madde metni)
 *  - KAP: /tr/api/disclosures (tarihler "şimdi"ye çekilmiş liste), /tr/Bildirim/<no> (bildirim metni)
 *  - Telegram: POST /bot<token>/sendMessage → kaydedilir; GET /__telegram ile okunur
 *  - POST /__mode?rg=broken|normal → Resmi Gazete fihristini "yeniden tasarlanmış" (madde bağlantısız) sayfaya çevirir
 *  - Hız ölçümü: rg/kap "pending" modunda kaynak henüz yayımlamamış gibi davranır (fihrist 404, KAP boş liste)
 */
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";

const FIX = new URL("../../../sources/fixtures/", import.meta.url);
const AG = new URL("../../../agents/fixtures/", import.meta.url);
const read = (u: URL) => readFileSync(u, "utf8");
/** Fihristteki madde sırası → belge fixture'ı (gerçek Resmi Gazete metinleri) */
const RG_DOCS: Record<string, string> = { "1": "01-organ-nakli", "2": "05-kirsehir-merkez", "3": "04-kilis-doner-sermaye", "4": "06-kgk-kurul-karari" };

export interface TelegramCall { token: string; chatId: string; text: string; at: string }
export type RgMode = "normal" | "broken" | "pending";
export interface MockServer { url: string; telegram: TelegramCall[]; hits: Record<string, number>; setRg(mode: RgMode): void; setKap(mode: "normal" | "pending"): void; close(): Promise<void> }

const pre = (title: string, body: string) => `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title></head><body><main><pre>${body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre></main></body></html>`;

/** KAP tarih biçimi (Europe/Istanbul): 27.09.2026 16:05:00 */
export function kapNow(d = new Date(), minusSeconds = 0): string {
  const p = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(new Date(d.getTime() - minusSeconds * 1000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("day")}.${g("month")}.${g("year")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

export function startMockServer(port = 0): Promise<MockServer> {
  const telegram: TelegramCall[] = [];
  const hits: Record<string, number> = {};
  let rgMode: RgMode = "normal";
  let kapMode: "normal" | "pending" = "normal";
  const dayHtml = read(new URL("day-2025-09-26.html", FIX));
  const kapJson = read(new URL("kap-disclosures.json", FIX));
  const kapDoc = read(new URL("kap/01-pay-geri-alim/document.txt", AG));

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const path = url.pathname;
    const send = (status: number, body: string, type = "text/html; charset=utf-8") => { res.writeHead(status, { "content-type": type }); res.end(body); };
    const hit = (k: string) => { hits[k] = (hits[k] ?? 0) + 1; };

    if (path === "/robots.txt") return send(200, "User-agent: *\nDisallow:\n", "text/plain");
    if (path === "/__telegram") return send(200, JSON.stringify(telegram), "application/json");
    if (path === "/__mode" && req.method === "POST") { rgMode = url.searchParams.get("rg") === "broken" ? "broken" : "normal"; return send(200, JSON.stringify({ rg: rgMode }), "application/json"); }

    let m = /^\/eskiler\/\d{4}\/\d{2}\/(\d{8})\.htm$/.exec(path);
    if (m) {
      hit("rg:day");
      if (rgMode === "pending") return send(404, "henüz yayımlanmadı");
      if (rgMode === "broken") return send(200, "<!DOCTYPE html><html><body><h1>T.C. Resmî Gazete</h1><div class=\"yeni-tasarim\" data-madde=\"1\">Organ Nakli Hizmetleri Yönetmeliği</div></body></html>");
      // Fixture günü istenen güne uyarlanır; PDF madde (KGK) sahte sunucuda HTML olarak verilir
      return send(200, dayHtml.split("20250926-4.pdf").join(`${m[1]}-4.htm`).split("20250926").join(m[1]!));
    }
    if (/^\/eskiler\/\d{4}\/\d{2}\/\d{8}M\d+\.htm$/.test(path)) { hit("rg:mukerrer"); return send(404, "yok"); }
    m = /^\/eskiler\/\d{4}\/\d{2}\/\d{8}-(\d+)\.(htm|pdf)$/.exec(path);
    if (m) {
      hit("rg:item");
      const dir = RG_DOCS[m[1]!];
      return dir ? send(200, pre("Resmî Gazete", read(new URL(`resmi-gazete/${dir}/document.txt`, AG)))) : send(404, "yok");
    }
    if (path === "/tr/api/disclosures") {
      hit("kap:list");
      if (kapMode === "pending") return send(200, "[]", "application/json; charset=utf-8");
      // Tüm tarihler şimdiye çekilir (sıra korunarak), böylece worker'ın "son 2 gün" penceresine girer.
      let i = 0;
      const body = kapJson.replace(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}/g, () => kapNow(new Date(), 60 * i++));
      return send(200, body, "application/json; charset=utf-8");
    }
    if (/^\/tr\/Bildirim\/\d+/.test(path)) { hit("kap:doc"); return send(200, pre("KAP Bildirim", kapDoc)); }

    m = /^\/bot([^/]+)\/sendMessage$/.exec(path);
    if (m && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const b = JSON.parse(raw || "{}") as { chat_id?: string; text?: string };
        telegram.push({ token: m![1]!, chatId: String(b.chat_id ?? ""), text: String(b.text ?? ""), at: new Date().toISOString() });
        send(200, JSON.stringify({ ok: true, result: { message_id: telegram.length } }), "application/json");
      });
      return;
    }
    hit("404");
    send(404, "bilinmeyen adres");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : port}`;
      resolve({ url, telegram, hits, setRg: (mode) => { rgMode = mode; }, setKap: (mode) => { kapMode = mode; }, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

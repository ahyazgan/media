import { describe, expect, it } from "vitest";
import { parseRobots, isAllowed } from "./robots.js";
import { politeFetch, _resetHttpState } from "./http.js";
import { htmlToText } from "./extract.js";

describe("robots", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /admin/\nAllow: /admin/public\nUser-agent: KaynakBot\nDisallow: /gizli/`);
  it("bizim UA grubunu tercih eder", () => {
    expect(isAllowed(rules, "/gizli/x")).toBe(false);
    expect(isAllowed(rules, "/admin/x")).toBe(true);
  });
  it("yıldız grubunu okur", () => {
    const star = parseRobots(`User-agent: *\nDisallow: /admin/\nAllow: /admin/public`, "otherbot");
    expect(isAllowed(star, "/admin/x")).toBe(false);
    expect(isAllowed(star, "/admin/public/y")).toBe(true);
    expect(isAllowed(star, "/eskiler/2025/09/20250926.htm")).toBe(true);
  });
});

describe("politeFetch", () => {
  it("429'da geri çekilir ve tekrar dener; UA gönderir", async () => {
    _resetHttpState();
    const calls: string[] = [];
    let n = 0;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:", { status: 200 });
      const ua = new Headers(init?.headers).get("user-agent") ?? "";
      expect(ua).toMatch(/^KaynakBot\/1\.0/);
      n++;
      if (n === 1) return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
      return new Response("<html><body>ok</body></html>", { status: 200 });
    }) as typeof fetch;
    const res = await politeFetch("https://example.test/eskiler/x.htm", { fetchImpl, maxRetries: 2 });
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c.endsWith("x.htm"))).toHaveLength(2);
  });
  it("robots.txt yasaklıysa istek atmaz", async () => {
    _resetHttpState();
    const fetchImpl = (async (input: string | URL | Request) => {
      if (String(input).endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /yasak/", { status: 200 });
      throw new Error("istek atılmamalıydı");
    }) as typeof fetch;
    await expect(politeFetch("https://example.test/yasak/a.htm", { fetchImpl })).rejects.toThrow(/robots/);
  });
});

describe("htmlToText", () => {
  it("script/nav atar, blokları satıra çevirir", () => {
    const t = htmlToText(`<html><body><nav>menü</nav><script>x()</script><div><p>MADDE 1- Birinci.</p><p>MADDE 2- İkinci.</p></div></body></html>`);
    expect(t).toBe("MADDE 1- Birinci.\n\nMADDE 2- İkinci.");
  });
});

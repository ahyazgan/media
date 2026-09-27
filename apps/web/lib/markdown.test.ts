import { describe, expect, it } from "vitest";
import { renderArticleMarkdown } from "./markdown";

describe("renderArticleMarkdown", () => {
  it("ham HTML'i metin olarak kaçırır (XSS yok)", () => {
    const out = renderArticleMarkdown("Merhaba <script>alert(1)</script> dünya\n\n<img src=x onerror=alert(2)>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });
  it("yalnızca http(s)/mailto bağlantılarına izin verir; javascript: bloklanır", () => {
    expect(renderArticleMarkdown("[a](https://x.gov.tr/b)")).toContain('href="https://x.gov.tr/b" rel="noopener nofollow" target="_blank"');
    expect(renderArticleMarkdown("[a](javascript:alert(1))")).toContain('href="#"');
  });
  it("markdown görselleri üretmez, listeleri ve paragrafları üretir", () => {
    const out = renderArticleMarkdown("Paragraf.\n\n- bir\n- iki\n\n![alt](https://x/y.png)");
    expect(out).toContain("<ul>");
    expect(out).not.toContain("<img");
    expect(out).toContain("alt");
  });
});

import { Marked } from "marked";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Haber gövdesi Markdown → HTML. Yazar ajanının (ya da belgedeki bir enjeksiyonun) üretebileceği ham HTML asla
 * geçirilmez: html jetonları metin olarak kaçırılır; bağlantılar yalnızca http(s)/mailto, `rel="noopener nofollow"`.
 * Görsel etiketi üretilmez (haberlerde görsel yok).
 */
const md = new Marked({
  async: false, gfm: true, breaks: false,
  renderer: {
    html({ text }) { return esc(text); },
    image({ text }) { return esc(text); },
    link({ href, title, tokens }) {
      const safe = /^(https?:|mailto:)/i.test(href) ? href : "#";
      const inner = this.parser.parseInline(tokens);
      return `<a href="${esc(safe)}"${title ? ` title="${esc(title)}"` : ""} rel="noopener nofollow"${/^https?:/i.test(safe) ? ' target="_blank"' : ""}>${inner}</a>`;
    },
  },
});

export function renderArticleMarkdown(src: string): string {
  return md.parse(src) as string;
}

import { customAlphabet } from "nanoid";

const shortId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);
const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function slugify(s: string): string {
  return s.toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => TR[c] ?? c)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .split("-").slice(0, 9).join("-");
}

/** Şartname 5.5: slugify(title) + "-" + shortId */
export function makeSlug(title: string, id = shortId()): string {
  return `${slugify(title) || "haber"}-${id}`;
}

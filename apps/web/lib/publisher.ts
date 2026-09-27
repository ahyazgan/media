/** Künye bilgileri (Basın Kanunu internet haber sitesi yükümlülüğü) — .env'den; boşsa "yapılandırılmadı" görünür. */
export function publisher() {
  const g = (k: string, d = "— (yapılandırılmadı)") => process.env[k]?.trim() || d;
  return {
    name: g("PUBLISHER_NAME"), address: g("PUBLISHER_ADDRESS"), email: process.env.PUBLISHER_EMAIL?.trim() || process.env.BOT_CONTACT_EMAIL?.trim() || "iletisim@example.com",
    phone: process.env.PUBLISHER_PHONE?.trim() || "", hosting: g("HOSTING_PROVIDER"), editor: g("RESPONSIBLE_EDITOR"), site: process.env.SITE_URL ?? "http://localhost:3000",
  };
}

/**
 * Künye bilgileri — .env'den; boşsa "yapılandırılmadı" görünür. 5187 sayılı Basın Kanunu (7418 ile değişik) internet haber
 * sitelerinden iş yeri adresi, ticari unvan (gerçek kişide ad soyad), e-posta, telefon, elektronik tebligat (UETS) adresi ile
 * yer sağlayıcının adı ve adresini ana sayfadan doğrudan erişilebilir biçimde "iletişim" başlığı altında ister.
 */
export function publisher() {
  const g = (k: string, d = "— (yapılandırılmadı)") => process.env[k]?.trim() || d;
  return {
    name: g("PUBLISHER_NAME"), address: g("PUBLISHER_ADDRESS"), email: process.env.PUBLISHER_EMAIL?.trim() || process.env.BOT_CONTACT_EMAIL?.trim() || "iletisim@example.com",
    phone: g("PUBLISHER_PHONE"), uets: g("PUBLISHER_UETS"), hosting: g("HOSTING_PROVIDER"), hostingAddress: g("HOSTING_ADDRESS"),
    editor: g("RESPONSIBLE_EDITOR"), site: process.env.SITE_URL ?? "http://localhost:3000",
  };
}

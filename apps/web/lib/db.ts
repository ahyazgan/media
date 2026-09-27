import { createDb, type DbHandle } from "@kaynak/db";

/**
 * Web yalnızca okur. Next dev'de modül sıcak yüklenirken bağlantı sızmasın diye globalThis'e asılır.
 * PGlite dosya modunda aynı dizini worker ile aynı anda açmak kilitlenir; bu yüzden geliştirmede
 * ya worker'ı ayrı bir DATABASE_URL ile çalıştır ya da pipeline'ı çalıştırıp bitince web'i aç.
 */
const g = globalThis as unknown as { __kaynakDb?: Promise<DbHandle> };

export function getDb(): Promise<DbHandle> {
  if (!g.__kaynakDb) {
    g.__kaynakDb = createDb(process.env.DATABASE_URL).then(async (h) => {
      if (h.dialect === "pglite") await h.migrate(); // gömülü modda şema hazır olsun
      return h;
    });
  }
  return g.__kaynakDb;
}

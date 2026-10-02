import { readdirSync, readFileSync } from "node:fs";
import * as tls from "node:tls";

/**
 * Bazı kurum sunucuları zincirin ara sertifikasını göndermez (BDDK: GlobalSign RSA OV SSL CA 2018) ya da Node'un tanımadığı
 * bir köke dayanır (Resmi Gazete: TÜBİTAK Kamu SM). Tarayıcılar ve Windows curl eksiği AIA ile tamamlar; Node tamamlamaz.
 * `packages/sources/certs/*.pem` dosyaları ilk istekte varsayılan CA listesine eklenir (Node ≥ 22.15 / 23.5:
 * `tls.setDefaultCACertificates`). Doğrulama kapatılmaz; yalnızca güven listesi genişler. Eski Node'da sessizce atlanır —
 * o durumda `NODE_EXTRA_CA_CERTS` kullanılır (docs/DAGITIM.md §4).
 */
let installed = false;

export function installExtraCAs(dir: URL = new URL("../certs/", import.meta.url)): number {
  if (installed) return 0;
  installed = true;
  const t = tls as typeof tls & { setDefaultCACertificates?: (certs: string[]) => void; getCACertificates?: (type?: string) => string[] };
  if (typeof t.setDefaultCACertificates !== "function" || typeof t.getCACertificates !== "function") return 0;
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".pem")); } catch { return 0; }
  const extra = files.flatMap((f) => readFileSync(new URL(f, dir), "utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []);
  if (!extra.length) return 0;
  // "default" = paketli kökler + NODE_EXTRA_CA_CERTS; bunlar korunur
  t.setDefaultCACertificates([...t.getCACertificates("default"), ...extra]);
  return extra.length;
}

/** Testler için */
export function _resetExtraCAs() { installed = false; }

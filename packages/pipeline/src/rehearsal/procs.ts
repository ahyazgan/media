import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";

export interface Proc { name: string; child: ChildProcess; logFile: string; output(): string }

/** Alt süreç: çıktı hem dosyaya hem belleğe (günlük kontrolleri için) yazılır. */
export function startProc(name: string, cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd: string, logFile: string): Proc {
  const out = createWriteStream(logFile);
  let buf = "";
  const child = spawn(cmd, args, { cwd, env, detached: process.platform !== "win32", shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  const onData = (d: Buffer) => { const s = d.toString(); buf = (buf + s).slice(-400_000); out.write(s); };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("exit", (code) => out.write(`\n[prova] ${name} çıktı: ${code}\n`));
  return { name, child, logFile, output: () => buf };
}

export function stopProc(p: Proc | undefined) {
  if (!p?.child.pid || p.child.exitCode !== null) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.child.pid), "/T", "/F"]);
    else process.kill(-p.child.pid, "SIGTERM"); // süreç grubu: pnpm + alt node süreci
  } catch { /* zaten kapanmış */ }
}

export async function waitFor(label: string, fn: () => Promise<boolean>, timeoutMs: number, everyMs = 2000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await fn()) { console.log(`[prova] ✓ ${label} (${Math.round((Date.now() - t0) / 1000)} sn)`); return true; } } catch { /* henüz hazır değil */ }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  console.log(`[prova] ✗ ${label}: ${timeoutMs / 1000} sn içinde olmadı`);
  return false;
}

export async function get(url: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30_000);
  try { const r = await fetch(url, { ...init, signal: ctl.signal }); return { status: r.status, text: await r.text() }; } finally { clearTimeout(t); }
}

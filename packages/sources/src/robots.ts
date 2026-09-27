/** Basit robots.txt: yalnızca User-agent: * ve bizim UA için Disallow/Allow kurallarına bakar. */
export interface RobotsRules { disallow: string[]; allow: string[]; crawlDelay?: number }

export function parseRobots(txt: string, ua = "kaynakbot"): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let cur: { agents: string[]; rules: RobotsRules } | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || cur.rules.allow.length || cur.rules.disallow.length || cur.rules.crawlDelay !== undefined) {
        cur = { agents: [], rules: { disallow: [], allow: [] } };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
    } else if (cur) {
      if (key === "disallow" && val) cur.rules.disallow.push(val);
      else if (key === "allow" && val) cur.rules.allow.push(val);
      else if (key === "crawl-delay") cur.rules.crawlDelay = Number(val) || undefined;
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  return (mine ?? star)?.rules ?? { disallow: [], allow: [] };
}

export function isAllowed(rules: RobotsRules, path: string): boolean {
  const match = (p: string) => path.startsWith(p.replace(/\*$/, ""));
  const allow = rules.allow.filter(match).sort((a, b) => b.length - a.length)[0];
  const dis = rules.disallow.filter(match).sort((a, b) => b.length - a.length)[0];
  if (!dis) return true;
  if (allow && allow.length >= dis.length) return true;
  return false;
}

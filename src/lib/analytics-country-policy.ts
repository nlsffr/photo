import { BlockList, isIP } from "node:net";

function normalizedIp(value: string): string | null {
  const ip = value.trim().toLowerCase().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
  return isIP(ip) && !ip.includes("%") ? ip : null;
}

function subnetList(cidrs: string): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs.split(",").map((v) => v.trim()).filter(Boolean)) {
    const [ip, prefix, extra] = cidr.split("/");
    const version = isIP(ip);
    if (!version || extra || !/^\d+$/.test(prefix ?? "")) throw Error("invalid_proxy_cidr");
    list.addSubnet(ip, Number(prefix), version === 4 ? "ipv4" : "ipv6");
  }
  return list;
}

const nonPublic = subnetList("0.0.0.0/8,10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,192.0.2.0/24,192.168.0.0/16,198.18.0.0/15,198.51.100.0/24,203.0.113.0/24,224.0.0.0/4,240.0.0.0/4,2001:db8::/32");
const globalV6 = subnetList("2000::/3");
const contains = (list: BlockList, ip: string) => list.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");

/** The private app's Nginx overwrites X-Real-IP with its peer and appends
 * that peer to X-Forwarded-For. Unverified peers stay unknown. */
export function createCountryIpResolver(cidrs: string) {
  let trusted: BlockList;
  try { trusted = subnetList(cidrs); } catch { return () => null; }
  return (headers: Pick<Headers, "get">): string | null => {
    const peer = normalizedIp(headers.get("x-real-ip") ?? "");
    const raw = headers.get("x-forwarded-for") ?? "";
    if (!peer || !contains(trusted, peer) || raw.length > 4096) return null;
    const chain = raw.split(",").map(normalizedIp);
    if (chain.length < 2 || chain.length > 16 || chain.some((ip) => !ip)) return null;
    if (chain.at(-1) !== peer) return null;
    for (let i = chain.length - 2; i >= 0; i--) {
      const ip = chain[i]!;
      if (contains(trusted, ip)) continue;
      if (contains(nonPublic, ip) || (isIP(ip) === 6 && !contains(globalV6, ip))) return null;
      return ip;
    }
    return null;
  };
}

export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase();
  return /^[A-Z]{2}$/.test(code) && !["ZZ", "EU", "AP"].includes(code) ? code : null;
}

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const blockedIpv6 = new BlockList();
blockedIpv6.addSubnet("::", 128, "ipv6");
blockedIpv6.addSubnet("::1", 128, "ipv6");
// IPv4-kompatible Adressen (veraltet, z. B. ::127.0.0.1) betten IPv4 ein – fail closed.
blockedIpv6.addSubnet("::", 96, "ipv6");
blockedIpv6.addSubnet("::ffff:0:0", 96, "ipv6");
// IPv4/IPv6-Übersetzung (NAT64, RFC 6052): 64:ff9b::a9fe:a9fe erreicht über ein NAT64-Gateway 169.254.169.254.
blockedIpv6.addSubnet("64:ff9b::", 96, "ipv6");
blockedIpv6.addSubnet("64:ff9b:1::", 48, "ipv6");
blockedIpv6.addSubnet("100::", 64, "ipv6");
blockedIpv6.addSubnet("2001::", 23, "ipv6");
blockedIpv6.addSubnet("2001:db8::", 32, "ipv6");
blockedIpv6.addSubnet("2002::", 16, "ipv6");
blockedIpv6.addSubnet("3fff::", 20, "ipv6");
blockedIpv6.addSubnet("fc00::", 7, "ipv6");
blockedIpv6.addSubnet("fe80::", 10, "ipv6");
// Site-local (veraltet, RFC 3879) – manche Stacks routen es weiterhin intern.
blockedIpv6.addSubnet("fec0::", 10, "ipv6");
blockedIpv6.addSubnet("ff00::", 8, "ipv6");

/** Only globally routable addresses; IPv4-mapped and special IPv6 ranges fail closed. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  if (isIP(address) === 6) {
    return !blockedIpv6.check(address, "ipv6");
  }
  return false;
}

export async function publicFetch(input: string, options: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string>; followRedirects?: boolean } = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 8_000);
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  let url = new URL(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port))) throw new Error("Diese URL ist nicht erlaubt.");
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Website-Zeitlimit überschritten.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS-Zeitlimit überschritten.")), remaining); }),
    ]).finally(() => clearTimeout(timer));
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error("Diese Netzwerkadresse ist nicht erlaubt.");
    const address = addresses[0];
    // Pin the validated DNS answer to the actual socket. No second DNS resolution / rebinding.
    const response = await new Promise<{ status: number; headers: Record<string, string>; body: Buffer }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: "GET", agent: false,
        headers: { "Accept-Encoding": "identity", ...options.headers },
        lookup: (_host, opts, cb) => {
          if (opts.all) cb(null, [address]);
          else cb(null, address.address, address.family);
        },
      }, res => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > maxBytes) request.destroy(new Error("Antwort ist zu groß."));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => resolve({ status: res.statusCode ?? 502, headers, body: Buffer.concat(chunks) }));
      });
      const timeout = setTimeout(() => request.destroy(new Error("Website-Zeitlimit überschritten.")), Math.max(1, deadline - Date.now()));
      request.on("error", reject);
      request.on("close", () => clearTimeout(timeout));
      request.end();
    });
    if (options.followRedirects !== false && response.status >= 300 && response.status < 400 && response.headers.location) {
      url = new URL(response.headers.location, url);
      continue;
    }
    return { ...response, finalUrl: url.toString() };
  }
  throw new Error("Zu viele Weiterleitungen.");
}

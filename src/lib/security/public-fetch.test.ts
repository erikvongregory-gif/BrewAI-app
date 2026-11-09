import { describe,it,expect,vi,afterEach } from "vitest";
const mocks=vi.hoisted(()=>({lookup:vi.fn()}));
vi.mock("node:dns/promises",()=>({lookup:mocks.lookup}));
import { isPublicAddress,publicFetch } from "./public-fetch";
afterEach(()=>vi.clearAllMocks());
describe("public network boundary",()=>{
 it("rejects loopback, private, link-local, mapped and special addresses",()=>{
  for(const ip of ["127.1.2.3","10.1.1.1","172.20.1.1","192.168.1.1","169.254.169.254","100.64.0.1","0.1.2.3","224.0.0.1","::1","::ffff:127.0.0.1","fc00::1","fe80::1","2001:db8::1"])
   expect(isPublicAddress(ip),ip).toBe(false);
  expect(isPublicAddress("8.8.8.8")).toBe(true);
  expect(isPublicAddress("2001:4860:4860::8888")).toBe(true);
 });
 it("rejects mixed public/private DNS answers before opening a socket",async()=>{
  mocks.lookup.mockResolvedValue([{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]);
  await expect(publicFetch("https://example.com")).rejects.toThrow("Netzwerkadresse");
 });
 it("rejects IPv6 forms that embed or translate IPv4 and deprecated site-local space",()=>{
  for(const ip of [
   "::7f00:1",          // IPv4-kompatibel ::127.0.0.1
   "::a9fe:a9fe",       // IPv4-kompatibel ::169.254.169.254
   "64:ff9b::7f00:1",   // NAT64 → 127.0.0.1
   "64:ff9b::a9fe:a9fe",// NAT64 → 169.254.169.254 (Cloud-Metadaten)
   "64:ff9b::a00:1",    // NAT64 → 10.0.0.1
   "fec0::1",           // site-local
   "feff::1",
   "::ffff:a9fe:a9fe",  // IPv4-mapped (bestehende Regel bleibt)
  ]) expect(isPublicAddress(ip),ip).toBe(false);
  // Öffentliche Adressen bleiben erlaubt.
  for(const ip of ["2606:4700:4700::1111","2a00:1450:4001:80b::200e","1.1.1.1"]) expect(isPublicAddress(ip),ip).toBe(true);
 });
 it("rejects a hostname that resolves to a NAT64 metadata address before opening a socket",async()=>{
  mocks.lookup.mockResolvedValue([{address:"64:ff9b::a9fe:a9fe",family:6}]);
  await expect(publicFetch("https://rebind.example")).rejects.toThrow("Netzwerkadresse");
 });
 it("rejects non-http schemes before DNS",async()=>{
  for(const url of ["file:///etc/passwd","ftp://example.com/x","gopher://example.com/"]) await expect(publicFetch(url)).rejects.toThrow();
  expect(mocks.lookup).not.toHaveBeenCalled();
 });
 it("rejects credentials and nonstandard ports",async()=>{
  await expect(publicFetch("https://user:pass@example.com")).rejects.toThrow();
  await expect(publicFetch("http://example.com:2375")).rejects.toThrow();
  expect(mocks.lookup).not.toHaveBeenCalled();
 });
});

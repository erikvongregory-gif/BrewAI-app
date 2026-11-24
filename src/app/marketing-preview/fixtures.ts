import type {
  DashboardHomeMediaItem,
  DashboardHomeSettings,
  DashboardHomeSummary,
} from "@/components/studio/dashboard/dashboard-home-utils";
import type { AdminTeamMember } from "@/components/dashboard/admin-team-view";
import type { AdminSettingsPayload } from "@/components/dashboard/admin-settings-view";
import type { MediaItem } from "@/components/studio/media/studio-media-library";
import type { HopfenHugoMessage } from "@/components/studio/hopfen-hugo-chat";

export const BREWERY = "Testbrauerei";
export const PROFILE = "Marie Keller";
export const EMAIL = "studio@testbrauerei.de";

export const MARKETING_SCREENS = [
  "dashboard",
  "dashboard-empty",
  "dashboard-incomplete",
  "assistant",
  "create",
  "create-locked",
  "media",
  "brand",
  "brand-empty",
  "team",
  "pricing",
  "settings",
  "videos",
  "dashboard-dark",
] as const;

export type MarketingScreenId = (typeof MARKETING_SCREENS)[number];

export function isMarketingScreenId(value: string): value is MarketingScreenId {
  return (MARKETING_SCREENS as readonly string[]).includes(value);
}

export const SCREEN_META: Record<
  MarketingScreenId,
  { file: string; waitFor: string; dark?: boolean; fullBleed?: boolean }
> = {
  dashboard: { file: "01-dashboard", waitFor: "Tokens verfügbar" },
  "dashboard-empty": { file: "02-dashboard-empty", waitFor: "Tokens verfügbar" },
  "dashboard-incomplete": { file: "03-dashboard-incomplete", waitFor: "Tokens verfügbar" },
  assistant: { file: "04-assistant", waitFor: "Kampagnen-Idee", fullBleed: true },
  create: { file: "05-create", waitFor: "Bilder", fullBleed: true },
  "create-locked": { file: "06-create-locked", waitFor: "Markenprofil", fullBleed: true },
  media: { file: "07-media", waitFor: "Mediathek" },
  brand: { file: "08-brand", waitFor: "Markenprofil" },
  "brand-empty": { file: "09-brand-empty", waitFor: "Markenprofil" },
  team: { file: "10-team", waitFor: "Team" },
  pricing: { file: "11-pricing", waitFor: "Brauerei" },
  settings: { file: "12-settings", waitFor: "Einstellungen" },
  videos: { file: "13-videos", waitFor: "Video" },
  "dashboard-dark": { file: "14-dashboard-dark", waitFor: "Tokens verfügbar", dark: true },
};

function utcDay(n: number) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function daysAgoIso(n: number) {
  return utcDay(n).toISOString();
}

export function buildTokenUsage(days: number) {
  const out: { date: string; tokens: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(i);
    const date = day.toISOString().slice(0, 10);
    const dow = day.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const campaign =
      i === 12 ? 210 : i === 28 ? 185 : i === 45 ? 240 : i === 61 ? 160 : i === 78 ? 195 : 0;
    const base = weekend ? 28 : 72;
    const wave = Math.round(34 * Math.sin(i / 5.5) + 18 * Math.cos(i / 11));
    const drift = Math.round((90 - i) * 0.35);
    const tokens = Math.max(12, base + wave + drift + campaign + (i % 3) * 8);
    out.push({ date, tokens });
  }
  return out;
}

export const SUMMARY_FULL: DashboardHomeSummary = {
  tokens: { monthly: 4500, used: 1680, remaining: 2820 },
  periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25).toISOString(),
  postsThisMonth: 47,
  chargesTotal: 128,
  teamMembers: 3,
  openInvites: 1,
  billingStatus: "active",
  plan: "pro",
  tokenUsageByDay: buildTokenUsage(90),
};

export const SUMMARY_EMPTY: DashboardHomeSummary = {
  tokens: { monthly: 1600, used: 0, remaining: 1600 },
  periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString(),
  postsThisMonth: 0,
  chargesTotal: 0,
  teamMembers: 1,
  openInvites: 0,
  billingStatus: "active",
  plan: "start",
  tokenUsageByDay: [],
};

const MEDIA_TITLES = [
  "Biergarten Abendlicht",
  "Helles Flaschen-Hero",
  "Wirtshaus Tresen",
  "Feierabend Maß",
  "Sommerfest Teaser",
  "Kellerbier Close-up",
  "Public Viewing",
  "Herbstbock Mood",
] as const;

const MEDIA_IMAGES = [
  "/studio-templates/biergarten.png",
  "/studio-templates/produkt.png",
  "/studio-templates/wirtshaus.png",
  "/studio-templates/feierabend.png",
] as const;

export const DASHBOARD_MEDIA: DashboardHomeMediaItem[] = MEDIA_TITLES.map((title, i) => ({
  id: `m${i + 1}`,
  imageUrl: MEDIA_IMAGES[i % MEDIA_IMAGES.length]!,
  title,
  prompt: title,
  createdAt: daysAgoIso(i),
  aspectRatio: i % 3 === 0 ? "4:5" : i % 3 === 1 ? "1:1" : "16:9",
  resolution: "2K" as const,
  generation: {
    mode: (["campaign", "studio", "hyperreal", "isolate"] as const)[i % 4],
    tokenCost: 28 + i * 4,
    chargeNumber: 128 - i,
  },
}));

export const LIBRARY_MEDIA: MediaItem[] = DASHBOARD_MEDIA.map((item) => ({
  id: item.id,
  imageUrl: item.imageUrl,
  thumbUrl: item.imageUrl,
  title: item.title,
  prompt: item.prompt,
  createdAt: item.createdAt,
  aspectRatio: item.aspectRatio,
  resolution: item.resolution,
  outputFormat: "png" as const,
  generation: item.generation ? { chargeNumber: item.generation.chargeNumber } : null,
}));

export const SETTINGS_COMPLETE: DashboardHomeSettings = {
  brandProfileMode: "guided",
  breweryName: BREWERY,
  brandWebsiteUrl: "https://testbrauerei.de",
  brandTone: "handwerklich, warm, modern, regional",
  brandColors: "#C7691E, #1A1816, #F4F1EC, #3D5A40",
  brandDos: "Natürliches Licht; Flasche im Fokus; echte Materialien",
  brandDonts: "Stock-Look; Neon; überladene Typografie",
  brandLockLevel: "balanced",
};

export const SETTINGS_INCOMPLETE: DashboardHomeSettings = {
  brandProfileMode: "guided",
  breweryName: BREWERY,
  brandWebsiteUrl: "",
  brandTone: "",
  brandColors: "",
  brandDos: "",
  brandDonts: "",
  brandLockLevel: "balanced",
};

export type MarketingBrandSettings = {
  brandProfileMode: "undecided" | "guided" | "skip";
  brandInstagramUrl: string;
  brandWebsiteUrl: string;
  brandProfileSource: "url" | "instagram" | "manual" | "skip";
  brandLockLevel: "strict" | "balanced" | "loose";
  breweryName: string;
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  brandReferenceImageUrls: string[];
  brandAnalyzedAt?: string;
};

export const BRAND_COMPLETE: MarketingBrandSettings = {
  brandProfileMode: "guided",
  brandInstagramUrl: "https://instagram.com/testbrauerei",
  brandWebsiteUrl: "https://testbrauerei.de",
  brandProfileSource: "url",
  brandLockLevel: "balanced",
  breweryName: BREWERY,
  brandTone: "handwerklich, warm, modern, regional",
  brandColors: "#C7691E, #1A1816, #F4F1EC, #3D5A40",
  brandDos: "Natürliches Licht; Flasche im Fokus; echte Materialien",
  brandDonts: "Stock-Look; Neon; überladene Typografie",
  brandReferenceImageUrls: [
    "/studio-templates/produkt.png",
    "/studio-templates/biergarten.png",
    "/studio-templates/wirtshaus.png",
  ],
  brandAnalyzedAt: new Date().toISOString(),
};

export const BRAND_EMPTY: MarketingBrandSettings = {
  brandProfileMode: "undecided",
  brandInstagramUrl: "",
  brandWebsiteUrl: "",
  brandProfileSource: "manual",
  brandLockLevel: "balanced",
  breweryName: "",
  brandTone: "",
  brandColors: "",
  brandDos: "",
  brandDonts: "",
  brandReferenceImageUrls: [],
};

export const TEAM_MEMBERS: AdminTeamMember[] = [
  { id: "1", email: EMAIL, name: PROFILE, role: "owner", status: "active" },
  { id: "2", email: "erik@testbrauerei.de", name: "Erik Bauer", role: "admin", status: "active" },
  { id: "3", email: "lisa@testbrauerei.de", name: "Lisa Wagner", role: "editor", status: "active" },
  { id: "4", email: "gast@agentur.de", name: "Agentur Gast", role: "viewer", status: "invited" },
];

export const ADMIN_SETTINGS: AdminSettingsPayload = {
  profileName: PROFILE,
  profilePhone: "+49 89 123456",
  breweryName: BREWERY,
  emailNotifications: true,
  weeklySummary: true,
  brandProfileMode: "guided",
  brandWebsiteUrl: "https://testbrauerei.de",
  brandLockLevel: "balanced",
};

export const CHAT_MESSAGES: HopfenHugoMessage[] = [
  {
    role: "user",
    text: "Wir launchen nächste Woche unser neues Helles. Welche Motiv-Ideen passen zu Testbrauerei?",
  },
  {
    role: "assistant",
    text: "Starkes Timing. Drei Richtungen, die zu eurem Markenprofil passen:\n\n1. **Biergarten Abendlicht** — Helles im Glas, warmes Gegenlicht, regionale Atmosphäre.\n2. **Flaschen-Hero am Holztisch** — Produktfokus, natürliche Materialien, ruhige Typo.\n3. **Feierabend-Moment** — Lifestyle, Maß und Gespräch, ohne Stock-Look.\n\nSoll ich daraus Bild-Prompts für den Composer bauen?",
  },
  {
    role: "user",
    text: "Ja — bitte Prompt für Variante 2, Format 4:5, 2K.",
  },
  {
    role: "assistant",
    text: "Hier ein markentreuer Prompt für **Helles Flaschen-Hero · 4:5 · 2K**:\n\n> Produktfoto einer hellen Bierflasche auf rustikalem Holztisch, natürliches Seitenlicht, warme Erd- und Bernsteintöne (#C7691E), handwerklich und modern, keine Neonfarben, keine Stock-Ästhetik, hoher Detailgrad, Markenetikett klar lesbar.\n\nDu kannst den Prompt direkt in **Bilder erstellen** übernehmen.",
  },
];

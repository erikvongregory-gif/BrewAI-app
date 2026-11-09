import { getWorkspace, workspaceResourceUser } from "@/lib/dashboard/workspace";
import { canWriteWithRole } from "@/lib/dashboard/teamRoles";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, createRouteHandlerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { getDashboardMetadata, mergeDashboardMetadata, type DashboardSettings } from "@/lib/dashboard/metadata";
import { parseBrandReferenceIdFromUrl, repairBrandReferenceImageUrls } from "@/lib/brand/reference-image-store";
import { normalizeWebsiteUrl } from "@/lib/brand/url-intake";
import {
  clampBrandSettingsFields,
  confirmEditedBrandFields,
  sanitizeDashboardSettings,
} from "@/lib/dashboard/settingsPayload";
import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";

const optionalHttpUrl = z
  .string()
  .max(1200)
  .transform((v) => {
    const trimmed = v.trim();
    if (!trimmed) return "";
    return normalizeWebsiteUrl(trimmed) ?? "";
  });

const settingsSchema = z.object({
  profileName: z.string().max(120),
  breweryName: z.string().max(120),
  profilePhone: z.string().max(60),
  profileAvatarUrl: z
    .string()
    .max(1200)
    .optional()
    .default("")
    .transform((value) => {
      const trimmed = value.trim();
      if (!trimmed) return "";
      try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
      } catch {
        return "";
      }
    }),
  emailNotifications: z.boolean(),
  weeklySummary: z.boolean(),
  brandProfileMode: z.enum(["undecided", "guided", "skip"]),
  brandInstagramUrl: optionalHttpUrl,
  brandWebsiteUrl: optionalHttpUrl,
  brandProfileSource: z.enum(["url", "instagram", "manual", "skip"]),
  brandLockLevel: z.enum(["strict", "balanced", "loose"]),
  brandTone: z.string().max(300),
  brandColors: z.string().max(300),
  brandDos: z.string().max(600),
  brandDonts: z.string().max(600),
  brandReferenceImageUrls: z
    .array(z.string().max(1200))
    .max(10)
    .transform((urls) =>
      urls.filter((u) => {
        try {
          const parsed = new URL(u.trim());
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      }),
    ),
  brandLabelReferenceUrl: z
    .string()
    .max(1200)
    .optional()
    .default("")
    .transform((value) => {
      try {
        const parsed = new URL(value.trim());
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
      } catch {
        return "";
      }
    }),
  brandAnalyzedAt: z.string().max(64).optional(),
  brandHeadlineFontName: z.string().max(80).optional().default(""),
  brandFontFileUrl: z
    .string()
    .max(1200)
    .optional()
    .default("")
    .transform((value) => {
      try {
        const parsed = new URL(value.trim());
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
      } catch {
        return "";
      }
    }),
  brandFontWeight: z.string().max(8).optional().default("700"),
});

function personalFromActor(actor: User) {
  const settings = getDashboardMetadata(actor.user_metadata).settings;
  const oauthAvatar =
    typeof actor.user_metadata?.avatar_url === "string"
      ? actor.user_metadata.avatar_url
      : typeof actor.user_metadata?.picture === "string"
        ? actor.user_metadata.picture
        : "";
  return {
    profileName:
      typeof settings?.profileName === "string" && settings.profileName.trim()
        ? settings.profileName
        : typeof actor.user_metadata?.full_name === "string"
          ? actor.user_metadata.full_name
          : "",
    profilePhone:
      typeof settings?.profilePhone === "string" && settings.profilePhone.trim()
        ? settings.profilePhone
        : typeof actor.user_metadata?.phone === "string"
          ? actor.user_metadata.phone
          : "",
    profileAvatarUrl:
      typeof settings?.profileAvatarUrl === "string" && settings.profileAvatarUrl.trim()
        ? settings.profileAvatarUrl
        : oauthAvatar,
    emailNotifications:
      typeof settings?.emailNotifications === "boolean" ? settings.emailNotifications : true,
    weeklySummary: typeof settings?.weeklySummary === "boolean" ? settings.weeklySummary : true,
  };
}

function brandFromWorkspace(workspace: User, origin: string) {
  const settings = getDashboardMetadata(workspace.user_metadata).settings;
  const rawReferenceUrls = Array.isArray(settings?.brandReferenceImageUrls)
    ? settings.brandReferenceImageUrls.filter((item): item is string => typeof item === "string").slice(0, 10)
    : [];
  const repairedRefs = repairBrandReferenceImageUrls(workspace.user_metadata, origin, rawReferenceUrls);

  return {
    breweryName:
      typeof settings?.breweryName === "string"
        ? settings.breweryName
        : typeof workspace.user_metadata?.brewery === "string"
          ? workspace.user_metadata.brewery
          : typeof workspace.user_metadata?.brewery_name === "string"
            ? workspace.user_metadata.brewery_name
            : "",
    brandProfileMode:
      settings?.brandProfileMode === "guided" || settings?.brandProfileMode === "skip"
        ? settings.brandProfileMode
        : ("undecided" as const),
    brandInstagramUrl: typeof settings?.brandInstagramUrl === "string" ? settings.brandInstagramUrl : "",
    brandWebsiteUrl: typeof settings?.brandWebsiteUrl === "string" ? settings.brandWebsiteUrl : "",
    brandProfileSource:
      settings?.brandProfileSource === "url" ||
      settings?.brandProfileSource === "instagram" ||
      settings?.brandProfileSource === "manual" ||
      settings?.brandProfileSource === "skip"
        ? settings.brandProfileSource
        : ("manual" as const),
    brandLockLevel:
      settings?.brandLockLevel === "balanced" || settings?.brandLockLevel === "loose"
        ? settings.brandLockLevel
        : ("strict" as const),
    brandTone: typeof settings?.brandTone === "string" ? settings.brandTone : "",
    brandColors: typeof settings?.brandColors === "string" ? settings.brandColors : "",
    brandDos: typeof settings?.brandDos === "string" ? settings.brandDos : "",
    brandDonts: typeof settings?.brandDonts === "string" ? settings.brandDonts : "",
    brandReferenceImageUrls: repairedRefs.urls,
    brandLabelReferenceUrl:
      typeof settings?.brandLabelReferenceUrl === "string" ? settings.brandLabelReferenceUrl : "",
    brandAnalyzedAt: typeof settings?.brandAnalyzedAt === "string" ? settings.brandAnalyzedAt : undefined,
    brandHeadlineFontName:
      typeof settings?.brandHeadlineFontName === "string" ? settings.brandHeadlineFontName : "",
    brandFontFileUrl: typeof settings?.brandFontFileUrl === "string" ? settings.brandFontFileUrl : "",
    brandFontWeight: typeof settings?.brandFontWeight === "string" ? settings.brandFontWeight : "700",
    brandReferenceImagesStale: rawReferenceUrls.length > 0 && repairedRefs.urls.length === 0,
  };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  if (actor && !(await hasPassedTwoFactor(actor))) {
    return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  }
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  let workspace: User;
  try {
    workspace = await workspaceResourceUser(actor, false);
  } catch {
    return NextResponse.json({ error: "Teamzugriff nicht erlaubt." }, { status: 403 });
  }

  // Frische Actor-Metadata (JWT kann stale sein).
  let actorFresh = actor;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(actor.id);
    if (data?.user) actorFresh = data.user;
  } catch {
    /* Session-Metadata */
  }

  const personal = await hydratePrivateAssets(personalFromActor(actorFresh), actorFresh.id);
  const brand = brandFromWorkspace(workspace, new URL(req.url).origin);
  const { brandReferenceImagesStale, ...brandSettings } = brand;

  const responseSettings: DashboardSettings = {
    ...personal,
    ...brandSettings,
  };

  return NextResponse.json({
    settings: {
      ...responseSettings,
      brandReferenceImagesStale,
    },
  });
}

export async function PUT(req: Request) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "dashboard-settings",
    limit: 25,
    windowMs: 60_000,
  });
  if (rateError) return rateError;
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }

  const authProbe = await createClient();
  const {
    data: { user: actor },
  } = await authProbe.auth.getUser();

  if (actor && !(await hasPassedTwoFactor(actor))) {
    return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  }
  if (!actor) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  let workspace: User;
  let canWriteBrand = true;
  try {
    const membership = await getWorkspace(actor.id);
    canWriteBrand = canWriteWithRole(membership.role);
    // Marke lesen immer erlaubt; Schreiben nur für Owner/Admin/Editor.
    workspace = await workspaceResourceUser(actor, false);
  } catch {
    return NextResponse.json({ error: "Teamzugriff nicht erlaubt." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const admin = createAdminClient();
  let actorMeta = actor.user_metadata;
  let workspaceMeta = workspace.user_metadata;
  try {
    const [actorAdmin, workspaceAdmin] = await Promise.all([
      admin.auth.admin.getUserById(actor.id),
      actor.id === workspace.id
        ? Promise.resolve(null)
        : admin.auth.admin.getUserById(workspace.id),
    ]);
    if (actorAdmin.data?.user?.user_metadata) actorMeta = actorAdmin.data.user.user_metadata;
    if (workspaceAdmin?.data?.user?.user_metadata) {
      workspaceMeta = workspaceAdmin.data.user.user_metadata;
    } else if (actor.id === workspace.id && actorAdmin.data?.user?.user_metadata) {
      workspaceMeta = actorAdmin.data.user.user_metadata;
    }
  } catch {
    /* Session-Metadata */
  }

  const existingPersonal = sanitizeDashboardSettings(getDashboardMetadata(actorMeta).settings);
  const existingBrand = sanitizeDashboardSettings(getDashboardMetadata(workspaceMeta).settings);
  const existingCombined = { ...existingBrand, ...existingPersonal };
  const mergedInput = clampBrandSettingsFields({
    ...existingCombined,
    ...(typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}),
  });

  const parsed = settingsSchema.safeParse(mergedInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Validierung fehlgeschlagen";
    return NextResponse.json({ error: `Ungültige Einstellungen (${detail}).` }, { status: 400 });
  }

  const payload = parsed.data;
  const origin = new URL(req.url).origin;
  const repairedRefs = repairBrandReferenceImageUrls(workspaceMeta, origin, payload.brandReferenceImageUrls);
  // Belegstatus kommt nie vom Client: geänderte Markentexte gelten als vom Nutzer bestätigt.
  const brandFieldStatus = confirmEditedBrandFields(existingBrand, payload);
  const brandPayload = {
    breweryName: payload.breweryName,
    brandProfileMode: payload.brandProfileMode,
    brandInstagramUrl: payload.brandInstagramUrl,
    brandWebsiteUrl: payload.brandWebsiteUrl,
    brandProfileSource: payload.brandProfileSource,
    brandLockLevel: payload.brandLockLevel,
    brandTone: payload.brandTone,
    brandColors: payload.brandColors,
    brandDos: payload.brandDos,
    brandDonts: payload.brandDonts,
    brandReferenceImageUrls: repairedRefs.urls,
    brandLabelReferenceUrl: payload.brandLabelReferenceUrl,
    brandAnalyzedAt: payload.brandAnalyzedAt,
    brandHeadlineFontName: payload.brandHeadlineFontName,
    brandFontFileUrl: payload.brandFontFileUrl,
    brandFontWeight: payload.brandFontWeight,
    ...(brandFieldStatus ? { brandFieldStatus } : {}),
  };
  const personalPayload = {
    profileName: payload.profileName,
    profilePhone: payload.profilePhone,
    profileAvatarUrl: payload.profileAvatarUrl,
    emailNotifications: payload.emailNotifications,
    weeklySummary: payload.weeklySummary,
  };

  // Owner behält seine persönlichen Felder, auch wenn ein Teammitglied speichert.
  const ownerPersonalKeep = {
    profileName: existingBrand.profileName,
    profilePhone: existingBrand.profilePhone,
    profileAvatarUrl: existingBrand.profileAvatarUrl,
    emailNotifications: existingBrand.emailNotifications,
    weeklySummary: existingBrand.weeklySummary,
  };
  const workspaceSettingsWrite =
    actor.id === workspace.id
      ? { ...brandPayload, ...personalPayload }
      : { ...existingBrand, ...brandPayload, ...ownerPersonalKeep };

  const actorSettingsWrite = { ...existingPersonal, ...personalPayload };
  const actorMerged = mergeDashboardMetadata(actorMeta, { settings: actorSettingsWrite });
  const actorUserMetadata = {
    ...actorMerged,
    full_name: payload.profileName || null,
    phone: payload.profilePhone || null,
    avatar_url: payload.profileAvatarUrl || null,
  };

  try {
    if (actor.id === workspace.id) {
      const workspaceMerged = mergeDashboardMetadata(workspaceMeta, { settings: workspaceSettingsWrite });
      const workspaceDashboard = (workspaceMerged as { dashboard?: Record<string, unknown> }).dashboard;
      const keepsInternalReferenceStore = brandPayload.brandReferenceImageUrls.some(
        (url) => parseBrandReferenceIdFromUrl(url) !== null,
      );
      if (
        workspaceDashboard &&
        typeof workspaceDashboard === "object" &&
        !keepsInternalReferenceStore &&
        "brandReferenceImages" in workspaceDashboard
      ) {
        delete workspaceDashboard.brandReferenceImages;
      }
      const combined = {
        ...workspaceMerged,
        ...actorUserMetadata,
        dashboard: {
          ...((workspaceMerged as { dashboard?: Record<string, unknown> }).dashboard ?? {}),
          ...((actorUserMetadata as { dashboard?: Record<string, unknown> }).dashboard ?? {}),
          settings: workspaceSettingsWrite,
        },
        full_name: payload.profileName || null,
        phone: payload.profilePhone || null,
        brewery: payload.breweryName || null,
        brewery_name: payload.breweryName || null,
      };
      const { error: adminError } = await admin.auth.admin.updateUserById(actor.id, {
        user_metadata: combined,
      });
      if (adminError) {
        console.error("[dashboard/settings] admin updateUserById failed:", adminError.message);
        return NextResponse.json(
          { error: "Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen." },
          { status: 500 },
        );
      }
    } else if (!canWriteBrand) {
      // Viewer: nur eigener Name/Telefon/Notifications.
      const { error: actorWriteError } = await admin.auth.admin.updateUserById(actor.id, {
        user_metadata: actorUserMetadata,
      });
      if (actorWriteError) {
        console.error("[dashboard/settings] viewer personal update failed:", actorWriteError.message);
        return NextResponse.json(
          { error: "Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen." },
          { status: 500 },
        );
      }
    } else {
      const workspaceMerged = mergeDashboardMetadata(workspaceMeta, { settings: workspaceSettingsWrite });
      const workspaceDashboard = (workspaceMerged as { dashboard?: Record<string, unknown> }).dashboard;
      const keepsInternalReferenceStore = brandPayload.brandReferenceImageUrls.some(
        (url) => parseBrandReferenceIdFromUrl(url) !== null,
      );
      if (
        workspaceDashboard &&
        typeof workspaceDashboard === "object" &&
        !keepsInternalReferenceStore &&
        "brandReferenceImages" in workspaceDashboard
      ) {
        delete workspaceDashboard.brandReferenceImages;
      }
      const workspaceMetaWrite = {
        ...workspaceMerged,
        brewery: payload.breweryName || null,
        brewery_name: payload.breweryName || null,
        full_name:
          typeof workspaceMeta?.full_name === "string" ? workspaceMeta.full_name : undefined,
        phone: typeof workspaceMeta?.phone === "string" ? workspaceMeta.phone : undefined,
      };
      const [workspaceWrite, actorWrite] = await Promise.all([
        admin.auth.admin.updateUserById(workspace.id, { user_metadata: workspaceMetaWrite }),
        admin.auth.admin.updateUserById(actor.id, { user_metadata: actorUserMetadata }),
      ]);
      if (workspaceWrite.error || actorWrite.error) {
        console.error(
          "[dashboard/settings] split update failed:",
          workspaceWrite.error?.message,
          actorWrite.error?.message,
        );
        return NextResponse.json(
          { error: "Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen." },
          { status: 500 },
        );
      }
    }
  } catch (adminWriteError) {
    console.error("[dashboard/settings] admin write failed:", adminWriteError);
    return NextResponse.json(
      { error: "Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen." },
      { status: 500 },
    );
  }

  const normalizedPayload = { ...payload, brandReferenceImageUrls: repairedRefs.urls };
  const response = NextResponse.json({ ok: true, settings: normalizedPayload });
  try {
    const supabase = createRouteHandlerClient(req, response);
    await Promise.race([
      supabase.auth.refreshSession(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 8_000);
      }),
    ]);
  } catch (refreshError) {
    console.warn("[dashboard/settings] refreshSession failed:", refreshError);
  }
  return response;
}

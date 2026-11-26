import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, createRouteHandlerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { getFreshUserMetadata } from "@/lib/dashboard/freshMetadata";
import { getDashboardMetadata, mergeDashboardMetadata } from "@/lib/dashboard/metadata";
import { readDashboardMedia } from "@/lib/dashboard/media-store";
import {
  EMPTY_STUDIO_ONBOARDING_STATE,
  mergeStudioOnboardingState,
  sanitizeStudioOnboardingState,
  type StudioOnboardingProgress,
} from "@/lib/dashboard/onboarding";
import { getEffectiveBillingRow } from "@/lib/billing/store";
import { hasActiveSubscription } from "@/lib/billing/access";

const patchSchema = z.object({
  welcome: z.boolean().optional(),
  checklistDismissed: z.boolean().optional(),
  celebrated: z.boolean().optional(),
  hints: z.array(z.string().max(40)).max(24).optional(),
  flowVersion: z.literal(2).optional(),
  currentStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  /** ISO string oder null zum Zurücksetzen (Restart). */
  completedAt: z.union([z.string().max(40), z.null()]).optional(),
  tourVersion: z.union([z.literal(1), z.null()]).optional(),
  /** Dashboard-UI-Rundgang; null zum Zurücksetzen. */
  uiTourVersion: z.union([z.literal(1), z.literal(2), z.null()]).optional(),
});

async function deriveProgress(
  userId: string,
  userMetadata: unknown,
): Promise<StudioOnboardingProgress> {
  const dashboard = getDashboardMetadata(userMetadata);
  const brandMode = dashboard.settings?.brandProfileMode;
  const team = dashboard.teamMembers ?? [];

  let plan = false;
  try {
    plan = hasActiveSubscription(await getEffectiveBillingRow(userId));
  } catch {
    /* Billing optional — Checkliste bleibt nutzbar */
  }

  const media = await readDashboardMedia(userId, { limit: 1 }).catch(() => dashboard.mediaLibrary ?? []);
  return {
    brand: brandMode === "guided" || brandMode === "skip",
    motif: media.length > 0,
    plan,
    team: team.some((member) => member.role !== "owner"),
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, false); } catch (e) { return workspaceErrorResponse(e); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const freshMetadata = await getFreshUserMetadata(user.id, user.user_metadata);
  return NextResponse.json({
    state: getDashboardMetadata(freshMetadata).onboarding ?? EMPTY_STUDIO_ONBOARDING_STATE,
    progress: await deriveProgress(user.id, freshMetadata),
  });
}

export async function PATCH(req: Request) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "dashboard-onboarding",
    limit: 40,
    windowMs: 60_000,
  });
  if (rateError) return rateError;
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Onboarding-Status." }, { status: 400 });
  }

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch (e) { return workspaceErrorResponse(e); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const freshMetadata = await getFreshUserMetadata(user.id, user.user_metadata);
  const current = sanitizeStudioOnboardingState(getDashboardMetadata(freshMetadata).onboarding);
  const next = mergeStudioOnboardingState(current, parsed.data as Parameters<typeof mergeStudioOnboardingState>[1]);
  const userMetadata = mergeDashboardMetadata(freshMetadata, { onboarding: next });

  try {
    const admin = createAdminClient();
    const { error: adminError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: userMetadata,
    });
    if (adminError) {
      return NextResponse.json(
        { error: "Onboarding-Status konnte nicht gespeichert werden." },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Onboarding-Status konnte nicht gespeichert werden." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    state: next,
    progress: await deriveProgress(user.id, userMetadata),
  });
  try {
    const routeClient = createRouteHandlerClient(req, response);
    await Promise.race([
      routeClient.auth.refreshSession(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 8_000);
      }),
    ]);
  } catch {
    /* Session-Refresh ist best-effort */
  }
  return response;
}

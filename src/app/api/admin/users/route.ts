import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, enforceSameOrigin } from "@/lib/security/requestGuards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin/auth";
import { isOwnerUser } from "@/lib/auth/owner";

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "user"]),
});

export async function GET(req: Request) {
  const rateError = enforceRateLimit(req, { keyPrefix: "admin-users-get", limit: 60, windowMs: 60_000 });
  if (rateError) return rateError;
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Kein Admin-Zugriff." }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const client = createAdminClient();
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data.users ?? [])
    .map((u) => {
      const role = typeof u.app_metadata?.role === "string" ? String(u.app_metadata.role) : "user";
      return {
        id: u.id,
        email: u.email ?? "",
        role,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
        brewery:
          typeof u.user_metadata?.brewery === "string"
            ? u.user_metadata.brewery
            : typeof u.user_metadata?.brewery_name === "string"
              ? u.user_metadata.brewery_name
              : "",
      };
    })
    .filter((u) => {
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.brewery.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return NextResponse.json({ users });
}

export async function PATCH(req: Request) {
  const rateError = enforceRateLimit(req, { keyPrefix: "admin-users-patch", limit: 30, windowMs: 60_000 });
  if (rateError) return rateError;
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Kein Admin-Zugriff." }, { status: 403 });

  const parsed = roleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (parsed.data.userId === admin.userId) {
    return NextResponse.json({ error: "Die eigene Rolle kann hier nicht geändert werden." }, { status: 403 });
  }

  const client = createAdminClient();
  // Betreiber-Konten (app_metadata.role = owner oder OWNER_EMAILS) nie über diese Route ändern:
  // Das Überschreiben von app_metadata.role würde einem Owner still die Owner-Rechte entziehen.
  const target = await client.auth.admin.getUserById(parsed.data.userId);
  if (target.error || !target.data?.user) {
    return NextResponse.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
  }
  if (isOwnerUser(target.data.user)) {
    return NextResponse.json({ error: "Betreiber-Konten können hier nicht geändert werden." }, { status: 403 });
  }
  const { error } = await client.auth.admin.updateUserById(parsed.data.userId, {
    app_metadata: { role: parsed.data.role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

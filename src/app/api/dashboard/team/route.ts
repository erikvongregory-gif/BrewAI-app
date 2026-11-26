import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { getWorkspace, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { ensureBillingRow } from "@/lib/billing/store";
import { createWorkspaceInvite } from "@/lib/dashboard/teamInvites";
import { enforceSameOrigin, enforceRateLimitPersistent } from "@/lib/security/requestGuards";
import { sendTeamInviteEmail } from "@/lib/email/teamInvite";
import { getAppBaseUrlOrigin } from "@/lib/supabase/env";
import { canManageTeam } from "@/lib/dashboard/teamRoles";
const role = z.enum(["admin", "editor", "viewer"]);
async function context(req: Request, manage = false) {
  const origin = enforceSameOrigin(req); if (origin) return origin;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich." }, { status: 403 });
  const limit = await enforceRateLimitPersistent(req,{ keyPrefix:"team",limit:30,windowMs:60000 },{identifierParts:[user.id]});
  if (limit) return limit;
  let workspace: Awaited<ReturnType<typeof getWorkspace>>;
  try { workspace = await getWorkspace(user.id); } catch (error) { return workspaceErrorResponse(error); }
  if (manage && !canManageTeam(workspace.role)) return NextResponse.json({ error: "Teamverwaltung nicht erlaubt." }, { status: 403 });
  return { ...workspace, user };
}
async function members(ownerId: string) {
  const admin = createAdminClient();
  const [owner, active, invites] = await Promise.all([
    admin.auth.admin.getUserById(ownerId),
    admin.from("workspace_members").select("*").eq("owner_id", ownerId),
    admin.from("workspace_invites").select("id,email,name,role,created_at").eq("owner_id", ownerId).gt("expires_at",new Date().toISOString()),
  ]);
  if (owner.error || active.error || invites.error) throw new Error("Team konnte nicht geladen werden.");
  const rows = await Promise.all((active.data ?? []).map(async row => {
    const member = await admin.auth.admin.getUserById(row.user_id);
    if (member.error) throw new Error("Teammitglied konnte nicht geladen werden.");
    const meta = member.data.user.user_metadata as Record<string, unknown> | undefined;
    const dash = meta?.dashboard as { settings?: { profileName?: string } } | undefined;
    const name =
      (typeof dash?.settings?.profileName === "string" && dash.settings.profileName.trim()) ||
      (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
      member.data.user.email;
    return { id:row.user_id,email:member.data.user.email,name,role:row.role,status:"active",invitedAt:row.created_at };
  }));
  const ownerMeta = owner.data.user?.user_metadata as Record<string, unknown> | undefined;
  const ownerDash = ownerMeta?.dashboard as { settings?: { profileName?: string } } | undefined;
  const ownerName =
    (typeof ownerDash?.settings?.profileName === "string" && ownerDash.settings.profileName.trim()) ||
    (typeof ownerMeta?.full_name === "string" && ownerMeta.full_name.trim()) ||
    "Inhaber";
  return [{ id:ownerId,email:owner.data.user?.email,name:ownerName,role:"owner",status:"active",invitedAt:owner.data.user?.created_at },...rows,
    ...(invites.data ?? []).map(row=>({ ...row,status:"invited",invitedAt:row.created_at }))];
}
export async function GET(req: Request) {
  try { const c=await context(req); if(c instanceof NextResponse)return c; return NextResponse.json({members:await members(c.ownerId),role:c.role}); }
  catch { return NextResponse.json({error:"Team konnte nicht geladen werden."},{status:500}); }
}
export async function POST(req: Request) {
  try {
    const c=await context(req,true); if(c instanceof NextResponse)return c;
    const parsed=z.object({email:z.string().trim().email().max(200),name:z.string().max(120).optional(),role:role.default("editor")}).safeParse(await req.json().catch(()=>null));
    if(!parsed.success){
      const field=parsed.error.issues[0]?.path[0];
      const message=field==="email"?"Bitte gib eine gültige E-Mail-Adresse ein.":field==="name"?"Der Name darf höchstens 120 Zeichen lang sein.":"Bitte prüf deine Eingaben.";
      return NextResponse.json({error:message},{status:400});
    }
    const input=parsed.data;
    if(c.role!=="owner" && input.role==="admin")return NextResponse.json({error:"Nur der Inhaber darf Administratoren einladen."},{status:403});
    if(input.email.toLowerCase()===c.user.email?.toLowerCase()) return NextResponse.json({error:"Du bist bereits im Team."},{status:409});
    await ensureBillingRow(c.ownerId);
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invite = await createWorkspaceInvite({
      ownerId: c.ownerId,
      email: input.email,
      name: input.name ?? input.email,
      role: input.role,
      tokenHash,
    });
    if ("error" in invite) return NextResponse.json({ error: invite.error }, { status: 409 });
    const url = `${getAppBaseUrlOrigin(new URL(req.url).origin)}/invite/team/${token}`;
    const admin = createAdminClient();
    const ownerAccount = await admin.auth.admin.getUserById(c.ownerId);
    const ownerMeta = ownerAccount.data.user?.user_metadata as Record<string, unknown> | undefined;
    const workspaceName =
      (typeof ownerMeta?.brewery_name === "string" && ownerMeta.brewery_name.trim()) ||
      (typeof ownerMeta?.breweryName === "string" && ownerMeta.breweryName.trim()) ||
      null;
    try {
      await sendTeamInviteEmail({
        to: input.email,
        inviteUrl: url,
        role: input.role,
        inviteeName: input.name,
        inviterEmail: c.user.email,
        workspaceName,
      });
    } catch (error) {
      console.error("[dashboard/team] Einladungsmail fehlgeschlagen", error);
      await admin.from("workspace_invites").delete().eq("id", invite.id);
      return NextResponse.json({ error: "Einladung konnte nicht versendet werden." }, { status: 400 });
    }
    return NextResponse.json({ok:true,members:await members(c.ownerId)});
  } catch(error) {
    console.error("[dashboard/team] Einladung fehlgeschlagen", error);
    return NextResponse.json({error:"Einladung fehlgeschlagen. Bitte versuch es noch einmal."},{status:500});
  }
}
export async function PATCH(req: Request) {
  try {
    const c=await context(req,true); if(c instanceof NextResponse)return c;
    const input=z.object({memberId:z.string().uuid(),role}).parse(await req.json());
    if(input.memberId===c.ownerId || (c.role!=="owner" && input.role==="admin")) return NextResponse.json({error:"Nur der Inhaber darf Administratoren bestimmen."},{status:403});
    const admin=createAdminClient();
    const existing=await admin.from("workspace_members").select("role").eq("owner_id",c.ownerId).eq("user_id",input.memberId).maybeSingle();
    if(existing.error)throw new Error(existing.error.message);
    const invitation=await admin.from("workspace_invites").select("role").eq("owner_id",c.ownerId).eq("id",input.memberId).maybeSingle();
    if(invitation.error)throw new Error(invitation.error.message);
    if(c.role!=="owner" && (existing.data?.role==="admin" || invitation.data?.role==="admin")) return NextResponse.json({error:"Nur der Inhaber darf Administratoren ändern."},{status:403});
    const result=existing.data ? await admin.from("workspace_members").update({role:input.role}).eq("owner_id",c.ownerId).eq("user_id",input.memberId)
      : await admin.from("workspace_invites").update({role:input.role}).eq("owner_id",c.ownerId).eq("id",input.memberId);
    if(result.error)throw new Error(result.error.message);
    return NextResponse.json({ok:true,members:await members(c.ownerId)});
  } catch { return NextResponse.json({error:"Rolle konnte nicht geändert werden."},{status:400}); }
}
export async function DELETE(req: Request) {
  try {
    const c=await context(req,true); if(c instanceof NextResponse)return c;
    const id=z.string().uuid().parse(new URL(req.url).searchParams.get("memberId"));
    if(id===c.ownerId)return NextResponse.json({error:"Inhaber kann nicht entfernt werden."},{status:403});
    const admin=createAdminClient();
    const existing=await admin.from("workspace_members").select("role").eq("owner_id",c.ownerId).eq("user_id",id).maybeSingle();
    const invitation=await admin.from("workspace_invites").select("role").eq("owner_id",c.ownerId).eq("id",id).maybeSingle();
    if(existing.error||invitation.error)throw new Error("Teamprüfung fehlgeschlagen.");
    if(c.role!=="owner" && (existing.data?.role==="admin" || invitation.data?.role==="admin"))return NextResponse.json({error:"Nur der Inhaber darf Administratoren entfernen."},{status:403});
    for(const [table,key] of [["workspace_members","user_id"],["workspace_invites","id"]]) {
      const result=await admin.from(table).delete().eq("owner_id",c.ownerId).eq(key,id);if(result.error)throw new Error(result.error.message);
    }
    return NextResponse.json({ok:true,members:await members(c.ownerId)});
  } catch { return NextResponse.json({error:"Teammitglied konnte nicht entfernt werden."},{status:400}); }
}

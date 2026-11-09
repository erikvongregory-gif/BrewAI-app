"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardTeamRole } from "@/lib/dashboard/metadata";
import {
  canManageTeam,
  INVITE_TEAM_ROLES,
  TEAM_ROLE_DESCRIPTION,
  TEAM_ROLE_LABEL,
  type InviteTeamRole,
} from "@/lib/dashboard/teamRoles";
import { getInitials } from "@/lib/utils";

export type AdminTeamMember = {
  id: string;
  email: string;
  name: string;
  role: DashboardTeamRole;
  status: "active" | "invited";
};

const ROLE_VARIANT: Record<DashboardTeamRole, "default" | "info" | "warning" | "outline"> = {
  owner: "default",
  admin: "info",
  editor: "warning",
  viewer: "outline",
};

export function AdminTeamView({
  members,
  loaded = true,
  loadError = null,
  myRole = "owner",
  onMembersChange,
}: {
  members: AdminTeamMember[];
  loaded?: boolean;
  loadError?: string | null;
  /** Rolle des angemeldeten Users im Workspace. */
  myRole?: DashboardTeamRole;
  onMembersChange: (next: AdminTeamMember[]) => void;
}) {
  const canManage = canManageTeam(myRole);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteTeamRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  /** Entfernen erst nach Bestätigung — ein Fehlklick nimmt sonst sofort den Zugriff. */
  const [confirmRemove, setConfirmRemove] = useState<AdminTeamMember | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  async function sendInvite() {
    setError(null);
    setNotice(null);
    const email = inviteEmail.trim();
    if (!email) {
      setError("Bitte eine E-Mail eingeben.");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: inviteName.trim() || undefined, role: inviteRole }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; members?: AdminTeamMember[] }
        | null;
      if (!res.ok) {
        setError(json?.error || "Einladung fehlgeschlagen.");
        return;
      }
      if (Array.isArray(json?.members)) onMembersChange(json.members);
      setNotice(`Einladung an ${email} verschickt.`);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("editor");
    } catch {
      setError("Einladung konnte nicht gesendet werden.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(memberId: string, nextRole: InviteTeamRole) {
    setError(null);
    setNotice(null);
    setUpdatingRoleId(memberId);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role: nextRole }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; members?: AdminTeamMember[] }
        | null;
      if (!res.ok) {
        setError(json?.error || "Rolle konnte nicht geändert werden.");
        return;
      }
      if (Array.isArray(json?.members)) onMembersChange(json.members);
      setNotice(`Rolle auf ${TEAM_ROLE_LABEL[nextRole]} gesetzt.`);
    } catch {
      setError("Rolle konnte nicht geändert werden.");
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function removeMember(memberId: string) {
    setError(null);
    setNotice(null);
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/dashboard/team?memberId=${encodeURIComponent(memberId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; members?: AdminTeamMember[] }
        | null;
      if (!res.ok) {
        setError(json?.error || "Mitglied konnte nicht entfernt werden.");
        return;
      }
      if (Array.isArray(json?.members)) onMembersChange(json.members);
      setNotice("Mitglied entfernt.");
    } catch {
      setError("Mitglied konnte nicht entfernt werden.");
    } finally {
      setRemovingId(null);
    }
  }

  const activeCount = members.filter((m) => m.status === "active").length;
  const invitedCount = members.filter((m) => m.status === "invited").length;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl leading-none tracking-tight">Team</h1>
          <p className="text-muted-foreground text-sm">
            Lade Kolleginnen und Kollegen ein, um gemeinsam Motive zu erstellen.
          </p>
        </div>
        <Badge variant="secondary">{loaded ? `${members.length} Mitglieder` : "…"}</Badge>
      </div>

      {loadError ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive" role="alert">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Mitglied einladen</CardTitle>
            <CardDescription>Einladung mit Login-Link per E-Mail</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="team-invite-email">E-Mail</Label>
              <Input
                id="team-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="kollege@beispiel.de"
                disabled={inviting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-invite-name">Name</Label>
              <Input
                id="team-invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Optional"
                disabled={inviting}
              />
            </div>
            <div className="grid gap-2">
              <Label>Rolle</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as InviteTeamRole)}
                disabled={inviting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_TEAM_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {TEAM_ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" disabled={inviting} onClick={() => void sendInvite()}>
                {inviting ? "Sende …" : "Einladen"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-4">
              {TEAM_ROLE_DESCRIPTION[inviteRole]}
            </p>
            {error ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{error}</p> : null}
            {notice ? <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">{notice}</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Deine Rolle ({TEAM_ROLE_LABEL[myRole]}): {TEAM_ROLE_DESCRIPTION[myRole]}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Teammitglieder</CardTitle>
            <CardDescription>
              {activeCount} aktiv
              {invitedCount ? ` · ${invitedCount} Einladung offen` : ""}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="rounded-lg bg-muted/40 p-8 text-center text-muted-foreground text-sm">
              Noch keine Teammitglieder.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitglied</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="text-right">Aktion</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const label = m.name || m.email;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar size="sm">
                              <AvatarFallback>{getInitials(label)}</AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium text-sm">{label}</span>
                              <span className="truncate text-muted-foreground text-xs">
                                {m.email}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {m.role === "owner" || !canManage ? (
                            <div className="space-y-0.5">
                              <Badge size="sm" variant={ROLE_VARIANT[m.role]}>
                                {TEAM_ROLE_LABEL[m.role]}
                              </Badge>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Select
                                value={m.role}
                                disabled={updatingRoleId === m.id || removingId === m.id}
                                onValueChange={(v) => void changeRole(m.id, v as InviteTeamRole)}
                              >
                                <SelectTrigger size="sm" className="w-[9.5rem]" aria-label={`Rolle von ${label}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {INVITE_TEAM_ROLES.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {TEAM_ROLE_LABEL[role]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            size="sm"
                            variant={m.status === "invited" ? "warning" : "success"}
                          >
                            {m.status === "invited" ? "Einladung offen" : "Aktiv"}
                          </Badge>
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            {m.role !== "owner" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={removingId === m.id}
                                aria-label={`${label} entfernen`}
                                onClick={() => setConfirmRemove(m)}
                              >
                                {removingId === m.id ? "Entferne …" : "Entfernen"}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">Inhaber</span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {!canManage && error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRemove?.status === "invited" ? "Einladung zurückziehen?" : "Mitglied entfernen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove
                ? `${confirmRemove.name || confirmRemove.email} wird aus eurem Team entfernt. Du kannst die Person später erneut einladen.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = confirmRemove;
                setConfirmRemove(null);
                if (target) void removeMember(target.id);
              }}
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

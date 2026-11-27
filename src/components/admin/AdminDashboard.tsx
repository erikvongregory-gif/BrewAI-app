"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AdminTab = "users" | "billing" | "team" | "content";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  brewery: string;
  createdAt: string;
  lastSignInAt: string | null;
};

type BillingRow = {
  userId: string;
  email: string;
  plan: string | null;
  monthlyTokens: number;
  usedTokens: number;
  remainingTokens: number;
  status: string;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
};

type PlanOption = "start" | "growth" | "pro" | "enterprise";

export function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>("users");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [billingRows, setBillingRows] = useState<BillingRow[]>([]);
  const [billingPlanDrafts, setBillingPlanDrafts] = useState<Record<string, PlanOption>>({});
  const [billingSavingUserId, setBillingSavingUserId] = useState<string | null>(null);
  const [teamRows, setTeamRows] = useState<Array<Record<string, unknown>>>([]);
  const [contentRows, setContentRows] = useState<Array<Record<string, unknown>>>([]);

  const loadUsers = async () => {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const data = (await res.json()) as { error?: string; users?: AdminUser[] };
    if (!res.ok) throw new Error(data.error ?? "Nutzer konnten nicht geladen werden.");
    setUsers(data.users ?? []);
  };

  const loadBilling = async () => {
    const res = await fetch("/api/admin/billing", { cache: "no-store" });
    const data = (await res.json()) as { error?: string; rows?: BillingRow[] };
    if (!res.ok) throw new Error(data.error ?? "Billing konnte nicht geladen werden.");
    const rows = data.rows ?? [];
    setBillingRows(rows);
    setBillingPlanDrafts((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        if (row.plan === "start" || row.plan === "growth" || row.plan === "pro" || row.plan === "enterprise") {
          next[row.userId] = row.plan;
        } else if (!next[row.userId]) {
          next[row.userId] = "start";
        }
      });
      return next;
    });
  };

  const updateUserPlan = async (userId: string, plan: PlanOption | null) => {
    setBillingSavingUserId(userId);
    setError("");
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, plan }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Plan konnte nicht aktualisiert werden.");
      }
      await loadBilling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan konnte nicht aktualisiert werden.");
    } finally {
      setBillingSavingUserId(null);
    }
  };

  const loadTeam = async () => {
    const res = await fetch("/api/admin/team", { cache: "no-store" });
    const data = (await res.json()) as { error?: string; rows?: Array<Record<string, unknown>> };
    if (!res.ok) throw new Error(data.error ?? "Teamdaten konnten nicht geladen werden.");
    setTeamRows(data.rows ?? []);
  };

  const loadContent = async () => {
    const res = await fetch("/api/admin/content", { cache: "no-store" });
    const data = (await res.json()) as { error?: string; rows?: Array<Record<string, unknown>> };
    if (!res.ok) throw new Error(data.error ?? "Inhalte konnten nicht geladen werden.");
    setContentRows(data.rows ?? []);
  };

  const loadActiveTab = async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "users") await loadUsers();
      else if (tab === "billing") await loadBilling();
      else if (tab === "team") await loadTeam();
      else await loadContent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActiveTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "users") return;
    const id = window.setTimeout(() => {
      void loadUsers().catch((e) => setError(e instanceof Error ? e.message : "Suche fehlgeschlagen."));
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab]);

  const tabButton = (value: AdminTab, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={tab === value ? "secondary" : "ghost"}
      aria-pressed={tab === value}
      onClick={() => setTab(value)}
    >
      {label}
    </Button>
  );

  const usersView = (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        aria-label="Nutzer suchen"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Suche nach E-Mail, Rolle, Brauerei …"
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-Mail</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Brauerei</TableHead>
              <TableHead>Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell data-label="E-Mail">{user.email}</TableCell>
                <TableCell data-label="Rolle">{user.role}</TableCell>
                <TableCell data-label="Brauerei">{user.brewery || "—"}</TableCell>
                <TableCell data-label="Aktion">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const nextRole = user.role === "admin" ? "user" : "admin";
                      const res = await fetch("/api/admin/users", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: user.id, role: nextRole }),
                      });
                      const data = (await res.json()) as { error?: string };
                      if (!res.ok) {
                        setError(data.error ?? "Rolle konnte nicht geändert werden.");
                        return;
                      }
                      await loadUsers();
                    }}
                  >
                    {user.role === "admin" ? "Admin entfernen" : "Zu Admin machen"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Keine Nutzer gefunden.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const billingView = (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User-ID</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Monatlich</TableHead>
            <TableHead>Verbraucht</TableHead>
            <TableHead>Verfügbar</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Periode bis</TableHead>
            <TableHead>Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {billingRows.map((row) => (
            <TableRow key={row.userId}>
              <TableCell data-label="User-ID" className="font-mono text-xs">{row.userId}</TableCell>
              <TableCell data-label="E-Mail">{row.email || "—"}</TableCell>
              <TableCell data-label="Plan">{row.plan ?? "—"}</TableCell>
              <TableCell data-label="Monatlich" className="tabular-nums">{row.monthlyTokens.toLocaleString("de-DE")}</TableCell>
              <TableCell data-label="Verbraucht" className="tabular-nums">{row.usedTokens.toLocaleString("de-DE")}</TableCell>
              <TableCell data-label="Verfügbar" className="font-semibold tabular-nums">
                {row.remainingTokens.toLocaleString("de-DE")}
              </TableCell>
              <TableCell data-label="Status">{row.status}</TableCell>
              <TableCell data-label="Periode bis">
                {row.currentPeriodEnd ? new Date(row.currentPeriodEnd).toLocaleString("de-DE") : "—"}
              </TableCell>
              <TableCell data-label="Aktion">
                <div className="flex min-w-60 flex-wrap items-center gap-2">
                  <NativeSelect
                    size="sm"
                    aria-label={`Plan für ${row.email || row.userId}`}
                    value={billingPlanDrafts[row.userId] ?? "start"}
                    onChange={(e) =>
                      setBillingPlanDrafts((prev) => ({
                        ...prev,
                        [row.userId]: e.target.value as PlanOption,
                      }))
                    }
                    disabled={billingSavingUserId === row.userId}
                  >
                    <NativeSelectOption value="start">Start</NativeSelectOption>
                    <NativeSelectOption value="growth">Growth</NativeSelectOption>
                    <NativeSelectOption value="pro">Pro</NativeSelectOption>
                    <NativeSelectOption value="enterprise">Enterprise</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={billingSavingUserId === row.userId}
                    onClick={() => updateUserPlan(row.userId, billingPlanDrafts[row.userId] ?? "start")}
                  >
                    Freischalten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={billingSavingUserId === row.userId}
                    onClick={() => updateUserPlan(row.userId, null)}
                  >
                    Entziehen
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {billingRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                Keine Billing-Daten gefunden.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );

  const genericTable = (rows: Array<Record<string, unknown>>) => (
    <pre
      tabIndex={0}
      aria-label="Rohdaten"
      className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {JSON.stringify(rows, null, 2)}
    </pre>
  );

  return (
    <Card className="mt-2">
      <CardContent className="flex flex-col gap-4">
        <div role="group" aria-label="Bereich" className="flex flex-wrap gap-1">
          {tabButton("users", "Nutzer")}
          {tabButton("billing", "Billing")}
          {tabButton("team", "Team/Einladungen")}
          {tabButton("content", "Inhalte")}
        </div>
        {loading ? <p className="text-muted-foreground text-sm">Daten werden geladen …</p> : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-destructive-foreground text-sm">
            {error}
          </p>
        ) : null}
        {!loading && tab === "users" ? usersView : null}
        {!loading && tab === "billing" ? billingView : null}
        {!loading && tab === "team" ? genericTable(teamRows) : null}
        {!loading && tab === "content" ? (
          <div className="flex flex-col gap-3">
            {contentRows.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={async () => {
                const first = contentRows[0] as { ownerUserId?: string; id?: string };
                if (!first?.ownerUserId || !first?.id) return;
                const res = await fetch("/api/admin/content", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ownerUserId: first.ownerUserId, mediaId: first.id }),
                });
                const data = (await res.json()) as { error?: string };
                if (!res.ok) {
                  setError(data.error ?? "Inhalt konnte nicht gelöscht werden.");
                  return;
                }
                await loadContent();
              }}
            >
              Erstes Element entfernen (MVP)
            </Button>
            ) : null}
            {genericTable(contentRows)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

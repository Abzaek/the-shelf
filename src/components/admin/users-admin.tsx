"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChartNoAxesCombined, ChevronRight, MoreHorizontal, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import type { AdminUser, AuditEntry, Overview } from "@/server/admin";
import type { User } from "@/server/auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Metric, Panel, bytes, date } from "./dashboard";
import "./dashboard.css";

interface Initial {
  users: AdminUser[];
  overview: Overview;
  audit: AuditEntry[];
  registrationOpen: boolean;
}

type Confirm =
  | { kind: "delete"; user: AdminUser }
  | { kind: "promote" | "demote" | "disable" | "enable" | "signout" | "verify"; user: AdminUser }
  | null;

/** Deterministic timestamp (UTC) so server and client render identically. */
const stamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

const ROLE_LABEL: Record<string, string> = { user: "Reader", admin: "Admin", superadmin: "Super admin" };
const ACTION_LABEL: Record<string, string> = {
  "user.promote": "Promoted to admin", "user.demote": "Demoted to reader", "user.quota": "Quota changed", "user.disable": "Disabled",
  "user.enable": "Enabled", "user.verify": "Email verified by admin", "user.delete": "Account deleted", "user.revoke_sessions": "Signed out everywhere",
  "registration.open": "Registration opened", "registration.close": "Registration closed",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return data as T;
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function UsersAdmin({ viewer, initial }: { viewer: User; initial: Initial }) {
  const [users, setUsers] = useState(initial.users);
  const [overview, setOverview] = useState(initial.overview);
  const [audit, setAudit] = useState(initial.audit);
  const [registrationOpen, setRegistrationOpen] = useState(initial.registrationOpen);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [quotaTarget, setQuotaTarget] = useState<AdminUser | null>(null);
  const [quotaMb, setQuotaMb] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isSuper = viewer.role === "superadmin";

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const [u, o, a] = await Promise.all([
        api<{ users: AdminUser[] }>("/api/admin/users"),
        api<Overview>("/api/admin/overview"),
        api<{ entries: AuditEntry[] }>("/api/admin/audit"),
      ]);
      setUsers(u.users);
      setOverview(o);
      setAudit(a.entries);
      setRegistrationOpen(o.registrationOpen);
    } catch (err) {
      toast.error("Could not refresh", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await reload();
    } catch (err) {
      toast.error("Action failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
      setConfirm(null);
      setQuotaTarget(null);
    }
  };

  const patch = (u: AdminUser, body: Record<string, unknown>) => api(`/api/admin/users/${u.id}`, jsonInit("PATCH", body));

  const applyConfirm = () => {
    if (!confirm) return;
    const { kind, user } = confirm;
    if (kind === "delete") return run(`Deleted ${user.email}`, () => api(`/api/admin/users/${user.id}`, { method: "DELETE" }));
    if (kind === "promote") return run(`${user.email} is now an admin`, () => patch(user, { role: "admin" }));
    if (kind === "demote") return run(`${user.email} is now a reader`, () => patch(user, { role: "user" }));
    if (kind === "disable") return run(`Disabled ${user.email}`, () => patch(user, { disabled: true }));
    if (kind === "enable") return run(`Enabled ${user.email}`, () => patch(user, { disabled: false }));
    if (kind === "verify") return run(`Marked ${user.email} as verified`, () => patch(user, { emailVerified: true }));
    if (kind === "signout") return run(`Signed ${user.email} out everywhere`, () => api(`/api/admin/users/${user.id}/sessions`, { method: "DELETE" }));
  };

  const toggleRegistration = () =>
    run(registrationOpen ? "Registration closed" : "Registration opened", () =>
      api("/api/admin/settings", jsonInit("PATCH", { registrationOpen: !registrationOpen })),
    );

  const canManage = (u: AdminUser) => u.role !== "superadmin" && u.id !== viewer.id && (isSuper || u.role === "user");
  const filtered = users.filter((u) => !search || `${u.email} ${u.displayName}`.toLowerCase().includes(search.toLowerCase()));

  const confirmCopy: Record<NonNullable<Confirm>["kind"], { title: string; body: string; action: string; danger?: boolean }> = {
    delete: { title: "Delete this account?", body: "Removes the account and every book, file, note and bookmark it owns. This cannot be undone.", action: "Delete account", danger: true },
    promote: { title: "Make this user an admin?", body: "Admins can see analytics and manage regular readers. Only you can manage admins.", action: "Promote" },
    demote: { title: "Remove admin access?", body: "The account keeps its books and becomes a regular reader.", action: "Demote" },
    disable: { title: "Disable this account?", body: "The user is signed out everywhere and can't sign in until re-enabled. Their books stay.", action: "Disable", danger: true },
    enable: { title: "Re-enable this account?", body: "The user can sign in again.", action: "Enable" },
    signout: { title: "Sign out everywhere?", body: "All active sessions for this user are revoked.", action: "Sign out" },
    verify: { title: "Mark email as verified?", body: "Skips the confirmation link for this account.", action: "Verify" },
  };

  return (
    <div className="an-shell">
      <aside className="an-sidebar">
        <Link className="an-brand" href="/"><BookOpen size={24} /><span>The Shelf<small>ADMIN WORKSPACE</small></span></Link>
        <div className="an-sidebar-label">ANALYTICS</div>
        <nav aria-label="Analytics"><Link className="an-nav-link" href="/admin"><ChartNoAxesCombined size={17} />Analytics</Link></nav>
        <div className="an-sidebar-label">MANAGEMENT</div>
        <nav aria-label="Management"><span className="an-nav-link selected" aria-current="page"><Users size={17} />Users &amp; access<span className="an-nav-dot" /></span></nav>
        <div className="an-sidebar-bottom">
          <div className="an-private"><ShieldCheck size={17} /><span>{isSuper ? "Super admin" : "Administrator"}<small>{isSuper ? "You manage admins and readers" : "Admins manage readers only"}</small></span></div>
          <Link href="/"><ArrowLeft size={15} />Back to your library</Link>
          <div className="an-account"><span className="an-avatar">{(viewer.displayName || viewer.email).slice(0, 2).toUpperCase()}</span><div>{viewer.displayName || viewer.email}<small>{ROLE_LABEL[viewer.role]}</small></div></div>
        </div>
      </aside>

      <div className="an-main">
        <div className="an-topbar">
          <span><b>Users &amp; access</b><ChevronRight size={12} />Accounts, roles, quotas</span>
          <span className="an-live"><i />{overview.users} accounts · {overview.activeSessions} active sessions</span>
        </div>
        <div className="an-content">
          <div className="an-page-heading">
            <div>
              <div className="an-eyebrow">ACCESS CONTROL</div>
              <h1>Who&apos;s on the shelf</h1>
              <p>Super admin: {overview.superAdminEmail}. {isSuper ? "You can promote admins, change quotas, disable or delete accounts." : "You can manage readers. Only the super admin manages admins."}</p>
            </div>
            <button className="an-button" onClick={reload} disabled={refreshing}><RefreshCw size={13} className={refreshing ? "an-spinning" : ""} />Refresh</button>
          </div>

          <div className="an-metrics">
            <Metric label="Accounts" value={overview.users} note={`${overview.admins} with admin access`} />
            <Metric label="Unverified" value={overview.unverified} note={overview.requireEmailVerification ? "Email verification required" : "Verification not enforced"} />
            <Metric label="Disabled" value={overview.disabled} note="Sign-in blocked" />
            <Metric label="Storage used" value={bytes(overview.usedBytes)} note={`of ${bytes(overview.totalQuotaBytes)} cap · ${overview.diskFreeBytes !== null ? `${bytes(overview.diskFreeBytes)} disk free` : "disk unknown"}`} />
          </div>

          <Panel title="Sign-up" note="Runtime switch; overrides the deployment default.">
            <div className="an-toggle">
              <div>Open registration<small>{registrationOpen ? "Anyone with the link can create an account." : "Only existing accounts can sign in."}{!overview.emailConfigured && " Email is not configured, so new accounts start verified."}</small></div>
              <button type="button" role="switch" aria-checked={registrationOpen} aria-label="Open registration" className="an-switch" onClick={toggleRegistration} disabled={busy}><i /></button>
            </div>
          </Panel>

          <Panel title="Accounts" note="Sorted by role, then sign-up date.">
            <div className="an-table-controls"><div className="an-search"><input aria-label="Search accounts" placeholder="Search by email or name" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
            <div className="an-table-wrap">
              <table>
                <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Books</th><th>Storage</th><th>Sessions</th><th>Last seen</th><th>Joined</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id}>
                      <td><Link className="an-user-link" href={`/admin/users/${u.id}`}><span className="an-avatar">{(u.displayName || u.email).slice(0, 2).toUpperCase()}</span><span>{u.displayName || u.email}<small>{u.email}</small></span><ChevronRight size={13} /></Link></td>
                      <td><span className={`an-role an-role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                      <td>{u.disabled ? <span className="an-flag">Disabled</span> : <span className="an-flag an-flag-ok">Active</span>}{!u.emailVerified && <span className="an-flag">Unverified</span>}</td>
                      <td>{u.bookCount}</td>
                      <td>{bytes(u.usedBytes)}<small>of {bytes(u.quotaBytes)}</small></td>
                      <td>{u.sessionCount}</td>
                      <td>{date(u.lastSeenAt)}</td>
                      <td>{date(u.createdAt)}</td>
                      <td className="an-row-actions">
                        {canManage(u) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><button className="an-icon-button" aria-label={`Actions for ${u.email}`}><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="an-menu">
                              <DropdownMenuLabel className="truncate">{u.email}</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => { setQuotaTarget(u); setQuotaMb(String(Math.round(u.quotaBytes / 1024 ** 2))); }}>Set storage quota…</DropdownMenuItem>
                              {!u.emailVerified && <DropdownMenuItem onSelect={() => setConfirm({ kind: "verify", user: u })}>Mark email verified</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => setConfirm({ kind: "signout", user: u })}>Sign out everywhere</DropdownMenuItem>
                              {isSuper && (
                                <>
                                  <DropdownMenuSeparator />
                                  {u.role === "user"
                                    ? <DropdownMenuItem onSelect={() => setConfirm({ kind: "promote", user: u })}>Make admin</DropdownMenuItem>
                                    : <DropdownMenuItem onSelect={() => setConfirm({ kind: "demote", user: u })}>Remove admin access</DropdownMenuItem>}
                                </>
                              )}
                              <DropdownMenuSeparator />
                              {u.disabled
                                ? <DropdownMenuItem onSelect={() => setConfirm({ kind: "enable", user: u })}>Re-enable account</DropdownMenuItem>
                                : <DropdownMenuItem className="an-danger" onSelect={() => setConfirm({ kind: "disable", user: u })}>Disable account</DropdownMenuItem>}
                              <DropdownMenuItem className="an-danger" onSelect={() => setConfirm({ kind: "delete", user: u })}>Delete account…</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="an-footnote" style={{ padding: 0 }}>{u.id === viewer.id ? "You" : u.role === "superadmin" ? "Protected" : "Super admin only"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <div className="an-empty"><Users size={24} /><p>No accounts match.</p></div>}
            </div>
          </Panel>

          <Panel title="Admin activity" note="Latest administrative actions on this instance.">
            <div className="an-table-wrap an-audit">
              <table>
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}><td>{stamp(a.createdAt)}</td><td>{a.actorEmail}</td><td>{ACTION_LABEL[a.action] ?? a.action}</td><td>{a.targetEmail ?? "—"}</td><td>{a.detail || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              {!audit.length && <div className="an-empty"><ShieldCheck size={24} /><p>No administrative actions recorded yet.</p></div>}
            </div>
          </Panel>
        </div>
      </div>

      {/* Confirmations */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-serif text-xl font-medium">{confirmCopy[confirm.kind].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-medium text-foreground">{confirm.user.email}</span>
                  {confirmCopy[confirm.kind].body}
                  {confirm.kind === "delete" && ` Currently ${confirm.user.bookCount} books, ${bytes(confirm.user.usedBytes)}.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={(e) => { e.preventDefault(); void applyConfirm(); }} disabled={busy} className={confirmCopy[confirm.kind].danger ? "bg-destructive text-white hover:bg-destructive/90" : undefined}>
                  {busy ? "Working…" : confirmCopy[confirm.kind].action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Quota */}
      <Dialog open={!!quotaTarget} onOpenChange={(o) => !o && !busy && setQuotaTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-medium">Storage quota</DialogTitle>
            <DialogDescription>{quotaTarget?.email} currently uses {quotaTarget ? bytes(quotaTarget.usedBytes) : ""}.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (!quotaTarget) return; const mb = Number(quotaMb); if (!Number.isFinite(mb) || mb < 0) return; void run(`Quota set to ${mb} MB`, () => patch(quotaTarget, { quotaBytes: Math.round(mb * 1024 ** 2) })); }}>
            <div className="grid gap-1.5">
              <Label htmlFor="quota-mb">Quota in MB</Label>
              <Input id="quota-mb" inputMode="numeric" value={quotaMb} onChange={(e) => setQuotaMb(e.target.value.replace(/[^\d.]/g, ""))} autoFocus />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => quotaTarget && void run("Quota reset to default", () => patch(quotaTarget, { quotaBytes: null }))}>Reset to default</Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setQuotaTarget(null)} disabled={busy}>Cancel</Button>
                <Button type="submit" disabled={busy || !quotaMb}>Save</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

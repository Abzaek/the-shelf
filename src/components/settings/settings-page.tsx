"use client";

import { eraseDeletedAccount } from "@/lib/storage/local/runtime";
import { OfflineSettings } from "@/components/offline/offline-settings";
import { useRef, useState } from "react";
import { Download, FileArchive, LogOut, Moon, Sun, SunMoon, Trash2, Upload, Sparkles } from "lucide-react";
import { ProgressBar } from "@/components/books/progress-bar";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLibrary } from "@/components/library-provider";
import { useBooks } from "@/hooks/use-books";
import { exportLibraryJson, exportLibraryZip, importParsedBackup, parseBackupFile, type ParsedBackup } from "@/lib/backup";
import { addSampleBooks } from "@/lib/seed";
import { storage } from "@/lib/storage";
import { downloadBlob } from "@/lib/utils/download";
import { formatBytes } from "@/lib/utils/format";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReadingMode, ThemePreference, ZoomPreset } from "@/types";

const ZOOM_OPTIONS: { value: string; label: string; preset: ZoomPreset }[] = [
  { value: "fit-width", label: "Fit width", preset: "fit-width" },
  { value: "fit-page", label: "Fit page", preset: "fit-page" },
  { value: "1", label: "100%", preset: 1 },
  { value: "1.25", label: "125%", preset: 1.25 },
  { value: "1.5", label: "150%", preset: 1.5 },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-border/70 py-8 first:border-t-0 first:pt-0 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="font-serif text-[20px] font-medium tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Row({ label, description, htmlFor, children }: { label: string; description?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-[14px]">{label}</Label>
        {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, user, usage, signOut } = useLibrary();
  const router = useRouter();
  const { stats } = useBooks();
  const [exporting, setExporting] = useState<"json" | "zip" | null>(null);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null);
  const [importing, setImporting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    setExporting("json");
    try {
      const { blob, fileName } = await exportLibraryJson();
      downloadBlob(blob, fileName);
      toast.success("Library exported", { description: fileName });
    } catch (err) {
      toast.error("Export failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  };

  const exportZip = async () => {
    setExporting("zip");
    setZipProgress({ done: 0, total: stats.total });
    try {
      const { blob, fileName } = await exportLibraryZip((done, total) => setZipProgress({ done, total }));
      downloadBlob(blob, fileName);
      toast.success("Library and files exported", { description: `${fileName} · ${formatBytes(blob.size)}` });
    } catch (err) {
      toast.error("Export failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(null);
      setZipProgress(null);
    }
  };

  const pickImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPendingImport(await parseBackupFile(file));
    } catch (err) {
      toast.error("Could not read backup", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const summary = await importParsedBackup(pendingImport);
      toast.success(`Imported ${summary.booksAdded} ${summary.booksAdded === 1 ? "book" : "books"}`, {
        description: [
          summary.booksSkipped ? `${summary.booksSkipped} already on your shelf` : null,
          summary.booksWithoutFile ? `${summary.booksWithoutFile} without a book file` : null,
          `${summary.bookmarksAdded} bookmarks · ${summary.notesAdded} notes · ${summary.collectionsAdded} collections`,
        ]
          .filter(Boolean)
          .join(" · "),
        duration: 8000,
      });
      setPendingImport(null);
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setImporting(false);
    }
  };

  const clearLibrary = async () => {
    await storage.clearLibrary();
    setClearOpen(false);
    setClearText("");
    toast("Library cleared");
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const deletedUserId = user?.id;
      await authClient.deleteAccount(deletePassword);
      await signOut();
      if (deletedUserId) await eraseDeletedAccount(deletedUserId);
      toast("Account deleted");
      router.replace("/login");
    } catch (err) {
      toast.error("Could not delete account", { description: err instanceof Error ? err.message : undefined });
      setDeleting(false);
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const added = await addSampleBooks();
      toast.success(added ? `Added ${added} sample books` : "Sample books are already on your shelf");
    } finally {
      setSeeding(false);
    }
  };

  const zoomValue = typeof settings.defaultZoom === "number" ? String(settings.defaultZoom) : settings.defaultZoom;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-serif text-[28px] font-medium leading-none tracking-tight sm:text-[32px]">Settings</h1>
      <p className="mt-2 mb-10 text-sm text-muted-foreground">Your books live on the server, in your account. Back up now and then anyway.</p>

      <OfflineSettings />
      <Section title="Appearance">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 sm:max-w-md">
          {(
            [
              { value: "light", label: "Light", Icon: Sun },
              { value: "dark", label: "Dark", Icon: Moon },
              { value: "system", label: "System", Icon: SunMoon },
            ] as { value: ThemePreference; label: string; Icon: typeof Sun }[]
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.theme === value}
              onClick={() => updateSettings({ theme: value })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                settings.theme === value ? "border-brass bg-brass/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Reading" description="Defaults for the reader. You can still change these per session.">
        <Row label="Default zoom" htmlFor="default-zoom">
          <Select
            value={zoomValue}
            onValueChange={(v) => updateSettings({ defaultZoom: ZOOM_OPTIONS.find((o) => o.value === v)?.preset ?? "fit-width" })}
          >
            <SelectTrigger id="default-zoom" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZOOM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Default reading mode" description="Single page or continuous scroll." htmlFor="default-mode">
          <Select value={settings.defaultReadingMode} onValueChange={(v) => updateSettings({ defaultReadingMode: v as ReadingMode })}>
            <SelectTrigger id="default-mode" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single page</SelectItem>
              <SelectItem value="continuous">Continuous</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Remember last page" description="Reopen books where you left off." htmlFor="remember-page">
          <Switch id="remember-page" checked={settings.rememberLastPage} onCheckedChange={(c) => updateSettings({ rememberLastPage: c })} />
        </Row>
      </Section>

      <Section title="Account" description={user ? user.email : undefined}>
        {usage && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-muted-foreground">Storage used</span>
              <span className="tabular-nums">
                {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)}
              </span>
            </div>
            <ProgressBar value={(usage.usedBytes / Math.max(1, usage.quotaBytes)) * 100} size="sm" label="Storage used" />
            <p className="text-[12.5px] text-muted-foreground">
              {stats.total} {stats.total === 1 ? "book" : "books"} on your shelf. Each account gets {formatBytes(usage.quotaBytes)}.
            </p>
          </div>
        )}
        <Row label="Sign out" description="You can sign back in on any device.">
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut aria-hidden data-icon="inline-start" /> Sign out
          </Button>
        </Row>
        <Row label="Delete account" description="Removes your account and every book, file, note and bookmark. Permanent.">
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden data-icon="inline-start" /> Delete…
          </Button>
        </Row>
      </Section>

      <Section title="Library">
        <Row label="Export library" description="Metadata, bookmarks, notes, collections and progress as JSON.">
          <Button variant="outline" onClick={exportJson} disabled={!!exporting}>
            <Download aria-hidden data-icon="inline-start" /> {exporting === "json" ? "Exporting…" : "Export JSON"}
          </Button>
        </Row>
        <Row label="Export with files" description="A full backup, including every PDF and EPUB, as a zip.">
          <Button variant="outline" onClick={exportZip} disabled={!!exporting || stats.total === 0}>
            <FileArchive aria-hidden data-icon="inline-start" />
            {exporting === "zip" && zipProgress ? `Packing ${zipProgress.done}/${zipProgress.total}…` : "Export zip"}
          </Button>
        </Row>
        <Row label="Import library" description="Restore a backup. Existing books are never overwritten.">
          <input
            ref={importRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            className="sr-only"
            aria-label="Choose a backup file to import"
            onChange={(e) => {
              void pickImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <Upload aria-hidden data-icon="inline-start" /> Import…
          </Button>
        </Row>
        <Row label="Sample books" description="Seven placeholder books with generated PDFs, for trying things out.">
          <Button variant="ghost" onClick={seed} disabled={seeding}>
            <Sparkles aria-hidden data-icon="inline-start" /> {seeding ? "Adding…" : "Add samples"}
          </Button>
        </Row>
        <Row label="Clear library" description="Delete every book, file, note and bookmark from your account.">
          <Button variant="destructive" onClick={() => setClearOpen(true)} disabled={stats.total === 0}>
            <Trash2 aria-hidden data-icon="inline-start" /> Clear…
          </Button>
        </Row>
      </Section>

      {/* Import confirmation */}
      <AlertDialog open={!!pendingImport} onOpenChange={(o) => !o && !importing && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium">Import this backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Exported {pendingImport ? new Date(pendingImport.backup.exportedAt).toLocaleString() : ""}.
                </p>
                <ul className="list-disc pl-5">
                  <li>{pendingImport?.backup.books.length ?? 0} books{pendingImport?.files.size ? ` (${pendingImport.files.size} with book files)` : " (metadata only)"}</li>
                  <li>{pendingImport?.backup.bookmarks.length ?? 0} bookmarks · {pendingImport?.backup.notes.length ?? 0} notes</li>
                  <li>{pendingImport?.backup.collections.length ?? 0} collections</li>
                </ul>
                <p>Books already on your shelf are skipped, never overwritten.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmImport(); }} disabled={importing}>
              {importing ? "Importing…" : "Import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeletePassword(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium">Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything on your shelf is deleted from the server immediately. Export a backup first if you want to keep anything.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="delete-password">Confirm with your password</Label>
            <Input id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void deleteAccount(); }}
              disabled={!deletePassword || deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear confirmation */}
      <AlertDialog open={clearOpen} onOpenChange={(o) => { setClearOpen(o); if (!o) setClearText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium">Clear the whole library?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {stats.total} {stats.total === 1 ? "book" : "books"}, every file, all notes, bookmarks and collections from your account. Export a backup first if you want to keep anything.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="clear-confirm">Type <span className="font-mono">DELETE</span> to confirm</Label>
            <Input id="clear-confirm" value={clearText} onChange={(e) => setClearText(e.target.value)} autoComplete="off" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void clearLibrary(); }}
              disabled={clearText !== "DELETE"}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Clear library
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { GlowButton } from "@/components/ui/glow-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StudioIcon } from "@/components/studio/icons";
import { MagneticText } from "@/components/ui/morphing-cursor";
import { cn } from "@/lib/utils";
import { calculateSeedanceVideoTokenCost } from "@/lib/billing/generationTokenCost";
import {
  getModel,
  modelsForSurface,
  parseSettings,
  type GenerationPlane,
  type MediaItem,
  type MediaRole,
  type ModelEntry,
  type SettingField,
} from "@/lib/generation/catalog";
import { watchRequest, stopWatching } from "@/lib/generation/poll";
import { applyPlane, assemblePlane } from "@/lib/generation/stores/assemble";
import { useActive } from "@/lib/generation/stores/active";
import { useVideoMedia } from "@/lib/generation/stores/media";
import { useVideoPrompt } from "@/lib/generation/stores/prompt";
import { useSettings } from "@/lib/generation/stores/settings";
import { getMediaDisplayTitle, type DashboardMediaItem } from "@/lib/dashboard/metadata";
import {
  ROLE_LABELS,
  VideoAssetPicker,
  type ShelfGeneration,
  type ShelfUpload,
} from "@/components/studio/video-asset-picker";

type RunTile = {
  id: string;
  requestId?: string;
  jobId?: string;
  status: "queued" | "running" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
  plane: GenerationPlane;
};

const ROLE_ACCEPT: Record<MediaRole, string> = {
  start: "image/*",
  end: "image/*",
  reference: "image/*",
  video: "video/*",
  audio: "audio/*",
};

function kindOfFile(file: File): "image" | "video" | "audio" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "image";
}

/** Mediathek speichert Videos teils als imageUrl — an Extension/Pfad erkennen. */
function kindFromMediaUrl(url: string): "image" | "video" | "audio" {
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|ogg|m4a)(\?|#|$)/i.test(url)) return "audio";
  return "image";
}

function useAutoResizeTextarea({ minHeight, maxHeight }: { minHeight: number; maxHeight?: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }
      textarea.style.height = `${minHeight}px`;
      textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Infinity))}px`;
    },
    [minHeight, maxHeight],
  );
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);
  return { textareaRef, adjustHeight };
}

type Props = { breweryName?: string };

export function VideoGenerationStudio({ breweryName }: Props) {
  const modelId = useActive((s) => s.model);
  const setModel = useActive((s) => s.setModel);
  const batch = useActive((s) => s.batch);
  const setBatch = useActive((s) => s.setBatch);
  const prompt = useVideoPrompt();
  const media = useVideoMedia();
  const settingsStore = useSettings();
  const models = useMemo(() => modelsForSurface("video"), []);
  const model = useMemo(() => {
    try {
      return getModel(modelId);
    } catch {
      return models[0];
    }
  }, [modelId, models]);

  const values = useMemo(
    () => parseSettings(model, settingsStore.byModel[model.id] ?? {}),
    [model, settingsStore.byModel],
  );

  const [tiles, setTiles] = useState<RunTile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [uploads, setUploads] = useState<ShelfUpload[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<ShelfGeneration[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRoleRef = useRef<MediaRole>("start");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 48, maxHeight: 150 });

  useEffect(() => () => stopWatching(), []);

  // Mediathek laden, sobald der Plus-Picker öffnet.
  useEffect(() => {
    if (!assetsOpen) return;
    let live = true;
    setLibraryLoading(true);
    void fetch("/api/dashboard/media?limit=48&offset=0", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Mediathek nicht ladbar");
        const data = (await res.json()) as { items?: DashboardMediaItem[] };
        if (!live) return;
        const mapped: ShelfGeneration[] = [];
        for (const item of data.items ?? []) {
          const url = item.imageUrl?.trim();
          if (!url || !/^https?:\/\//i.test(url)) continue;
          mapped.push({
            url,
            kind: kindFromMediaUrl(url),
            title: getMediaDisplayTitle(item),
            thumbUrl: item.thumbUrl?.trim() || undefined,
          });
        }
        setMediaLibrary(mapped);
      })
      .catch(() => {
        if (live) setMediaLibrary([]);
      })
      .finally(() => {
        if (live) setLibraryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [assetsOpen]);

  const estimatedCost = useMemo(() => {
    const resolutionRaw = String(values.resolution ?? "720p");
    const resolution =
      resolutionRaw === "4k" || resolutionRaw === "1080p"
        ? "1080p"
        : resolutionRaw === "480p"
          ? "480p"
          : "720p";
    return calculateSeedanceVideoTokenCost({
      resolution,
      duration: typeof values.duration === "number" ? Math.min(15, values.duration) : 5,
      generateAudio: Boolean(values.generateAudio ?? true),
      modelId: model.id,
      variantCount: batch,
    });
  }, [values, batch, model.id]);

  const canGenerate = prompt.text.trim().length > 0 && !busy;
  const hasMediaRoles = Object.keys(model.roles).length > 0;

  const settingSummary = useMemo(() => {
    const parts: string[] = [];
    if (typeof values.aspectRatio === "string") parts.push(values.aspectRatio);
    if (typeof values.resolution === "string") parts.push(values.resolution);
    if (typeof values.duration === "number") parts.push(`${values.duration}s`);
    return parts.slice(0, 2).join(" · ") || "Einstellungen";
  }, [values]);

  /** Mediathek + fertige Session-Videos (für Video-Slot / Wiederverwendung). */
  const shelfLibrary = useMemo((): ShelfGeneration[] => {
    const fromSession = tiles
      .filter((t) => t.status === "completed" && t.videoUrl)
      .map((t) => ({
        url: t.videoUrl!,
        kind: "video" as const,
        title: t.plane.prompt.text.slice(0, 80) || "Video",
      }));
    const seen = new Set(mediaLibrary.map((item) => item.url));
    const merged = [...mediaLibrary];
    for (const item of fromSession) {
      if (seen.has(item.url)) continue;
      merged.unshift(item);
    }
    return merged;
  }, [mediaLibrary, tiles]);

  function beginAttach(role: MediaRole) {
    const input = fileRef.current;
    if (!input || uploading) return;
    attachRoleRef.current = role;
    input.accept = ROLE_ACCEPT[role];
    input.multiple = (model.roles[role] ?? 0) > 1;
    input.click();
  }

  function applyRoleUrls(role: MediaRole, urls: string[]) {
    const max = model.roles[role] ?? 0;
    const kept = media.items.filter((item) => item.role !== role);
    const next: MediaItem[] = urls.slice(0, max).map((url) => ({
      id: crypto.randomUUID(),
      url,
      role,
    }));
    media.replace([...kept, ...next]);
  }

  async function uploadFile(file: File, role: MediaRole): Promise<string> {
    const form = new FormData();
    form.set("file", file);
    form.set("role", role);
    const res = await fetch("/api/generation/upload", { method: "POST", body: form, credentials: "include" });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? "Upload fehlgeschlagen.");
    setUploads((prev) => [
      { url: data.url!, kind: kindOfFile(file), name: file.name },
      ...prev.filter((u) => u.url !== data.url),
    ]);
    return data.url;
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const role = attachRoleRef.current;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await uploadFile(file, role));
      }
      const max = model.roles[role] ?? 0;
      const existing = media.items.filter((item) => item.role === role).map((item) => item.url);
      if (max === 1) {
        applyRoleUrls(role, urls.slice(0, 1));
      } else {
        applyRoleUrls(role, [...existing, ...urls].slice(0, max));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    setError(null);
    setBusy(true);
    const plane = assemblePlane();
    const pending: RunTile[] = Array.from({ length: batch }, () => ({
      id: crypto.randomUUID(),
      status: "queued" as const,
      plane,
    }));
    setTiles((prev) => [...pending, ...prev]);
    prompt.setText("");
    adjustHeight(true);

    try {
      await Promise.all(
        pending.map(async (tile) => {
          try {
            const res = await fetch("/api/generation/submit", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              credentials: "include",
              body: JSON.stringify(plane),
            });
            const data = (await res.json()) as {
              requestId?: string;
              jobId?: string;
              error?: string;
            };
            if (!res.ok || !data.requestId) {
              throw new Error(data.error ?? "Submit fehlgeschlagen.");
            }
            setTiles((prev) =>
              prev.map((t) =>
                t.id === tile.id
                  ? { ...t, requestId: data.requestId, jobId: data.jobId, status: "running" }
                  : t,
              ),
            );
            window.dispatchEvent(new CustomEvent("evglab-billing-updated"));
            const status = await watchRequest(data.requestId);
            if (status.status === "completed" && status.video?.url) {
              setTiles((prev) =>
                prev.map((t) =>
                  t.id === tile.id ? { ...t, status: "completed", videoUrl: status.video!.url } : t,
                ),
              );
              window.dispatchEvent(new CustomEvent("evglab-billing-updated"));
            } else {
              throw new Error(
                typeof status.error === "string" ? status.error : "Generierung fehlgeschlagen.",
              );
            }
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : String(caught);
            setTiles((prev) =>
              prev.map((t) => (t.id === tile.id ? { ...t, status: "failed", error: message } : t)),
            );
          }
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleReuse(tile: RunTile) {
    applyPlane(tile.plane);
    adjustHeight();
    setError(null);
  }

  return (
    <div className="relative isolate flex h-full min-h-0 w-full flex-1 flex-col items-center bg-white dark:bg-black">
      <div className="relative z-10 flex h-full min-h-0 w-full flex-1 flex-col items-center">
        {/* Center: brand or result gallery */}
        <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-4 py-6 sm:py-8">
          {tiles.length === 0 ? (
            <div className="my-auto text-center">
              <h1 className="sr-only">BrewAI Videos</h1>
              <MagneticText
                text="BrewAI"
                hoverText="BrewAI"
                textClassName="text-4xl font-semibold tracking-normal drop-shadow-sm 2xl:text-5xl"
              />
              <p className="mt-2 text-muted-foreground">
                {breweryName ? `Videos für ${breweryName}` : "Ideen brauen. Videos zapfen."}
              </p>
            </div>
          ) : (
            <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2 2xl:max-w-4xl">
              {tiles.map((tile) => (
                <article
                  key={tile.id}
                  className="overflow-hidden rounded-xl border border-border bg-background shadow-sm dark:border-sidebar-border dark:bg-sidebar"
                >
                  <div className="aspect-video bg-muted">
                    {tile.status === "completed" && tile.videoUrl ? (
                      <video className="h-full w-full object-cover" controls playsInline src={tile.videoUrl} />
                    ) : tile.status === "failed" ? (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-destructive">
                        <p>{tile.error ?? "Fehlgeschlagen"}</p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleReuse(tile)}>
                          <StudioIcon name="refresh" size={14} />
                          <span className="ml-1.5">Erneut</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-full animate-pulse flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                        <span className="size-5 animate-spin rounded-full border-2 border-acc border-t-transparent" />
                        {tile.status === "queued" ? "In Warteschlange …" : "ModelArk arbeitet …"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <span className="truncate">{tile.plane.model}</span>
                    {tile.status === "completed" ? (
                      <button
                        type="button"
                        className="font-medium text-acc hover:underline"
                        onClick={() => handleReuse(tile)}
                      >
                        Reuse
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Bottom composer — same dock as Bilder erstellen */}
        <div className="mb-3 flex w-full max-w-3xl shrink-0 flex-col gap-3 px-4 md:mb-[clamp(1rem,5vh,3.5rem)] 2xl:max-w-4xl">
          {error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className={cn("brew-composer", busy && "is-busy")}>
            <div className="brew-composer__glow" aria-hidden />
            <div className="brew-composer__ring" aria-hidden />
            <div
              className={cn(
                "brew-composer__surface rounded-xl border",
                "border-border bg-background shadow-sm",
                "dark:border-sidebar-border dark:bg-sidebar",
              )}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {media.items.length > 0 ? (
                  <motion.div
                    key="media-chips"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex flex-wrap gap-2 px-3 pt-3"
                  >
                    {media.items.map((item) => (
                      <div key={item.id} className="group relative">
                        <div
                          className={cn(
                            "relative size-14 overflow-hidden rounded-xl border border-border bg-muted shadow-sm",
                            "ring-1 ring-acc/20",
                          )}
                          title={ROLE_LABELS[item.role]}
                        >
                          {item.role === "audio" ? (
                            <span className="flex h-full items-center justify-center text-[10px] font-medium text-muted-foreground">
                              Audio
                            </span>
                          ) : item.role === "video" ? (
                            <video
                              src={item.url}
                              muted
                              playsInline
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.url}
                              alt={ROLE_LABELS[item.role]}
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5 pt-3 text-[9px] font-semibold uppercase tracking-wide text-white">
                            {item.role === "start"
                              ? "Start"
                              : item.role === "end"
                                ? "Ende"
                                : item.role === "reference"
                                  ? "Ref"
                                  : item.role === "video"
                                    ? "Video"
                                    : "Audio"}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`${ROLE_LABELS[item.role]} entfernen`}
                          onClick={() => media.remove(item.id)}
                          className={cn(
                            "absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full",
                            "border border-border bg-background text-muted-foreground shadow-sm",
                            "opacity-90 transition-opacity hover:opacity-100 hover:text-foreground",
                          )}
                        >
                          <StudioIcon name="x" size={10} />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="flex items-start gap-1 px-2 pt-2">
                {hasMediaRoles ? (
                  <Popover open={assetsOpen} onOpenChange={setAssetsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Medien anhängen"
                        aria-expanded={assetsOpen}
                        disabled={uploading}
                        className={cn(
                          "mt-0.5 size-9 shrink-0 rounded-xl bg-transparent text-foreground hover:bg-muted",
                          "dark:text-white dark:hover:bg-white/10",
                          (assetsOpen || media.items.length > 0) && "text-acc",
                        )}
                      >
                        {uploading ? (
                          <span className="size-4 animate-spin rounded-full border-2 border-acc border-t-transparent" />
                        ) : (
                          <StudioIcon name="plus" size={18} />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="top"
                      sideOffset={8}
                      className="w-auto gap-0 overflow-hidden p-0"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <VideoAssetPicker
                        model={model}
                        items={media.items}
                        uploads={uploads}
                        library={shelfLibrary}
                        libraryLoading={libraryLoading}
                        uploading={uploading}
                        onUpload={beginAttach}
                        onApply={applyRoleUrls}
                        onClose={() => setAssetsOpen(false)}
                      />
                    </PopoverContent>
                  </Popover>
                ) : null}

                <Textarea
                  ref={textareaRef}
                  value={prompt.text}
                  onChange={(e) => {
                    prompt.setText(e.target.value);
                    adjustHeight();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) {
                      e.preventDefault();
                      void handleGenerate();
                    }
                  }}
                  placeholder="Beschreibe dein Video…"
                  className={cn(
                    "min-h-[48px] w-full resize-none border-none bg-transparent px-2 py-3 text-sm shadow-none",
                    "text-foreground placeholder:text-muted-foreground",
                    "dark:bg-transparent dark:text-white dark:placeholder:text-neutral-400",
                    "focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0",
                  )}
                  style={{ overflow: "hidden" }}
                />
              </div>

              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  e.target.value = "";
                  void handleFilesSelected(files);
                }}
              />

              <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {/* Model */}
                  <Popover open={modelOpen} onOpenChange={setModelOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="Modell wählen"
                        className={cn(
                          "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                          "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                          "font-medium",
                        )}
                      >
                        <StudioIcon name="spark" size={16} />
                        <span className="hidden max-w-[9rem] truncate text-xs font-medium sm:inline">
                          {model.label}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-72 gap-0 p-1.5">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Modell
                      </div>
                      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                        {models.map((entry) => {
                          const active = entry.id === model.id;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted",
                                active && "bg-muted",
                              )}
                              onClick={() => {
                                setModel(entry.id);
                                setModelOpen(false);
                              }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{entry.label}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  ModelArk · Seedance
                                </span>
                              </span>
                              {active ? <StudioIcon name="check" size={14} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Batch */}
                  <Popover open={batchOpen} onOpenChange={setBatchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="Anzahl wählen"
                        className={cn(
                          "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                          "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                          "font-medium",
                        )}
                      >
                        <StudioIcon name="grid" size={16} />
                        <span className="text-xs font-medium tabular-nums">×{batch}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-44 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Anzahl
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {[1, 2, 3, 4].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                              batch === n && "bg-muted",
                            )}
                            onClick={() => {
                              setBatch(n);
                              setBatchOpen(false);
                            }}
                          >
                            <span className="font-medium tabular-nums">{n}</span>
                            <span className="text-xs text-muted-foreground">
                              {n === 1 ? "Video" : "Videos"}
                            </span>
                            {batch === n ? <StudioIcon name="check" size={14} className="ml-auto" /> : null}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Settings from catalog */}
                  <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="Einstellungen"
                        className={cn(
                          "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                          "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                          "font-medium",
                        )}
                      >
                        <StudioIcon name="gear" size={16} />
                        <span className="hidden max-w-[8rem] truncate text-xs font-medium sm:inline">
                          {settingSummary}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="top"
                      className="w-80 gap-0 p-1.5"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Einstellungen · {model.label}
                      </div>
                      <div className="max-h-[min(22rem,70vh)] overflow-y-auto px-1 pb-1">
                        <SettingsFields
                          model={model}
                          values={values}
                          onChange={(key, value) => settingsStore.setValue(model.id, key, value)}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>

                </div>

                <div className="flex w-full shrink-0 sm:w-auto sm:min-w-[13.5rem]">
                  <GlowButton
                    className="w-full"
                    disabled={!canGenerate}
                    onClick={() => void handleGenerate()}
                    showIcon={false}
                    label={
                      <>
                        Generieren
                        <span className="font-normal opacity-90">
                          <span className="sm:hidden"> · {estimatedCost.toLocaleString("de-DE")}</span>
                          <span className="hidden sm:inline">
                            {" "}
                            · {estimatedCost.toLocaleString("de-DE")} Tokens
                            {batch > 1 ? ` · ×${batch}` : ""}
                          </span>
                        </span>
                      </>
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsFields({
  model,
  values,
  onChange,
}: {
  model: ModelEntry;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      {Object.entries(model.settings).map(([key, field]) => (
        <SettingControl key={key} name={key} field={field} value={values[key]} onChange={onChange} />
      ))}
    </div>
  );
}

const SETTING_LABELS: Record<string, string> = {
  aspectRatio: "Seitenverhältnis",
  duration: "Dauer",
  resolution: "Auflösung",
  outputFormat: "Ausgabeformat",
  generateAudio: "Ton erzeugen",
};

const ASPECT_HINTS: Record<string, string> = {
  "16:9": "Querformat / YouTube",
  "4:3": "Klassisch quer",
  "1:1": "Quadrat",
  "3:4": "Hochformat",
  "9:16": "Story / Reel / TikTok",
  "21:9": "Ultrawide",
};

const RESOLUTION_HINTS: Record<string, string> = {
  "480p": "Schnell · weniger Tokens",
  "720p": "Standard",
  "1080p": "Full HD · mehr Tokens",
  "4k": "Sehr detailreich",
};

const FORMAT_HINTS: Record<string, string> = {
  mp4: "Universell · empfohlen",
  mov: "Apple / Schnitt",
};

function SettingControl({
  name,
  field,
  value,
  onChange,
}: {
  name: string;
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const label = SETTING_LABELS[name] ?? name;

  if (field.type === "enum") {
    const current = String(value ?? field.default);
    const hints =
      name === "aspectRatio"
        ? ASPECT_HINTS
        : name === "resolution"
          ? RESOLUTION_HINTS
          : name === "outputFormat"
            ? FORMAT_HINTS
            : {};

    return (
      <div>
        <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{label}</div>
        <div className="flex flex-col gap-0.5">
          {field.values.map((option) => {
            const active = current === option;
            const hint = hints[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(name, option)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                  active && "bg-muted",
                )}
              >
                <span className="w-14 shrink-0 font-medium tabular-nums tracking-tight">
                  {option}
                </span>
                {hint ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{hint}</span>
                ) : (
                  <span className="min-w-0 flex-1" />
                )}
                {active ? <StudioIcon name="check" size={14} className="shrink-0 text-acc" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "range") {
    const n = Number(value ?? field.default);
    return (
      <div className="px-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
            {n} Sek.
          </span>
        </div>
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={n}
          onChange={(e) => onChange(name, Number(e.target.value))}
          className="w-full accent-acc"
          aria-label={label}
        />
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{field.min}s</span>
          <span>{field.max}s</span>
        </div>
      </div>
    );
  }

  const checked = Boolean(value ?? field.default);
  return (
    <button
      type="button"
      onClick={() => onChange(name, !checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted",
        checked && "bg-muted",
      )}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-acc" : "bg-muted-foreground/30",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

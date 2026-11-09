"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ImagePlus, Search, X } from "lucide-react";
import { getMediaDisplayTitle, mediaPhotoStyleLabel, type DashboardBeer } from "@/lib/dashboard/metadata";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearActiveGeneration, readActiveGeneration } from "@/lib/inhalte-erstellen/active-generation";
import {
  isLandscapeAspect,
  jobAspectStyle,
  leadingMediaForJobs,
  shouldShowJobCard,
  type MediaJobCard,
} from "@/lib/inhalte-erstellen/media-job-cards";
import { jobProgressMessage, pollGenerationJob, type PolledJobResult } from "@/lib/inhalte-erstellen/poll-generation-job";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GenerationWaitFx } from "@/components/ui/ai-chat-image-generation-1";
import { cn } from "@/lib/utils";

/** Frosted-Reveal: Wipe erst, wenn das Motiv-Bild geladen ist. */
function MediaJobRevealThumb({
  job,
  message,
}: {
  job: MediaJobCard;
  message: string;
}) {
  const imageUrl = job.images[job.images.length - 1]?.imageUrl?.trim() || null;
  const done = job.status === "completed" && Boolean(imageUrl);
  const failed = job.status === "failed";
  const [imageReady, setImageReady] = useState(false);
  const [reveal, setReveal] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setImageReady(false);
    setReveal(0);
  }, [imageUrl]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setImageReady(true);
  }, [imageUrl]);

  useEffect(() => {
    if (!imageReady || failed) return;
    if (done) {
      setReveal(100);
      return;
    }
    const id = window.setInterval(() => {
      setReveal((prev) => {
        if (prev >= 100) return 100;
        const step = prev < 40 ? 2.2 : prev < 75 ? 1.4 : 0.9;
        return Math.min(100, prev + step);
      });
    }, 48);
    return () => window.clearInterval(id);
  }, [imageReady, done, failed]);

  const wipe = Math.max(0, Math.min(100, reveal));
  const showWipe = Boolean(imageUrl) && imageReady && !failed && wipe < 100;

  return (
    <div className="relative w-full overflow-hidden bg-muted" style={jobAspectStyle(job.aspectRatio)}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(120% 90% at 85% 100%, rgba(199, 105, 30, 0.55) 0%, transparent 55%),
            radial-gradient(90% 70% at 15% 20%, rgba(180, 175, 210, 0.55) 0%, transparent 50%),
            radial-gradient(70% 60% at 50% 50%, rgba(230, 228, 235, 0.9) 0%, #d8d6de 100%)
          `,
        }}
      />
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          className="absolute inset-0 size-full object-cover"
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setImageReady(true)}
        />
      ) : null}
      {showWipe ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{
            clipPath: `polygon(0 ${wipe}%, 100% ${wipe}%, 100% 100%, 0 100%)`,
          }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            background:
              "linear-gradient(105deg, rgba(245,244,248,0.72) 0%, rgba(232,180,130,0.5) 55%, rgba(199,105,30,0.4) 100%)",
            maskImage: `linear-gradient(to bottom, transparent ${Math.max(0, wipe - 4)}%, black ${Math.min(100, wipe + 6)}%)`,
            WebkitMaskImage: `linear-gradient(to bottom, transparent ${Math.max(0, wipe - 4)}%, black ${Math.min(100, wipe + 6)}%)`,
          }}
        />
      ) : null}
      <AnimatePresence>
        {!imageReady && !failed ? (
          <motion.div
            key="wait-fx"
            className="absolute inset-0 z-[1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={{ duration: 0.6 }}
          >
            <GenerationWaitFx compact />
            <span className="sr-only">{message}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export type MediaItem = {
  id: string;
  imageUrl: string;
  thumbUrl?: string;
  title?: string;
  prompt: string;
  createdAt: string;
  aspectRatio: string;
  resolution: "1K" | "2K" | "4K";
  outputFormat: "png" | "jpg";
  photoStyle?: "reportage" | "premium" | "campaign";
  beerName?: string;
  beerId?: string;
  generation?: { chargeNumber?: number | null } | null;
};

type MediaSortOrder = "newest" | "oldest";

const MEDIA_SORT_KEY = "brewai.media.sort";

function readMediaSortOrder(): MediaSortOrder {
  if (typeof window === "undefined") return "newest";
  try {
    return window.localStorage.getItem(MEDIA_SORT_KEY) === "oldest" ? "oldest" : "newest";
  } catch {
    return "newest";
  }
}

/** Match nur gegen hinterlegte Sorten — nie Freitext/Prompt-Fragmente aus dem Titel. */
export function mediaMatchesBeer(
  item: MediaItem,
  beer: { id?: string; name: string },
): boolean {
  const name = beer.name.trim();
  if (!name) return false;
  if (beer.id && item.beerId === beer.id) return true;
  if (item.beerName?.trim().toLowerCase() === name.toLowerCase()) return true;
  const title = getMediaDisplayTitle(item);
  const first = title.split(" · ")[0]?.trim() ?? "";
  return first.toLowerCase() === name.toLowerCase();
}

const STUDIO_EASE = [0.22, 0.68, 0.2, 1] as const;
const MEDIA_LIGHTBOX_SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.85 };

/** Bereits gecachte Bilder feuern onLoad evtl. vor der Hydration — dann sofort sichtbar schalten. */
function markMediaImgLoaded(img: HTMLImageElement | null) {
  if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = "1";
}

function clampText(v: string, max: number) {
  const s = (v ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return "gerade eben";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

type JobsApiJob = {
  id: string;
  status?: string;
  result?: PolledJobResult | null;
  created_at?: string;
};

function cardFromJob(job: JobsApiJob, highlighted: boolean, fallback?: Partial<MediaJobCard>): MediaJobCard {
  const result = (job.result ?? {}) as PolledJobResult;
  const snapshot = result.snapshot;
  const status: MediaJobCard["status"] =
    job.status === "failed" ? "failed" : job.status === "completed" ? "completed" : "reserved";
  return {
    jobId: job.id,
    status,
    phase: result.phase || (status === "reserved" ? "queued" : status),
    aspectRatio: result.aspectRatio || snapshot?.aspectRatio || fallback?.aspectRatio || "4:5",
    expectedVariants: result.expectedVariants || snapshot?.variantCount || fallback?.expectedVariants || 1,
    images: result.images ?? fallback?.images ?? [],
    error: typeof result.error === "string" ? result.error : fallback?.error,
    partial: result.partial,
    highlighted,
  };
}

function isLiveListedJob(job: JobsApiJob, focusedJobId: string) {
  // Fehlversuche nie in der Mediathek listen — nur laufende/noch nicht persistierte Erfolge.
  if (job.status === "failed") return false;
  if (job.id === focusedJobId) return true;
  if (job.status === "reserved") return true;
  const createdAt = job.created_at ? Date.parse(job.created_at) : 0;
  const recent = createdAt > 0 && Date.now() - createdAt < 15 * 60_000;
  if (job.status === "completed" && job.result?.mediaPersisted === false && recent) return true;
  return false;
}

function optimisticJobCard(jobId: string): MediaJobCard {
  const stored = typeof window === "undefined" ? null : readActiveGeneration();
  const match = stored?.jobId === jobId ? stored : null;
  return {
    jobId,
    status: "reserved",
    phase: "queued",
    aspectRatio: match?.aspectRatio || "4:5",
    expectedVariants: match?.variantCount || 1,
    images: [],
    highlighted: true,
  };
}

function useStudioJobCards(focusedJobId: string, onMediaRefresh?: () => void) {
  const [jobs, setJobs] = useState<MediaJobCard[]>([]);
  const [pollNonce, setPollNonce] = useState(0);
  const [suppressedJobIds, setSuppressedJobIds] = useState(() => new Set<string>());

  const mergeJob = useCallback((next: MediaJobCard) => {
    setJobs((current) => {
      const others = current.filter((item) => item.jobId !== next.jobId);
      return [next, ...others];
    });
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setSuppressedJobIds((prev) => {
      if (prev.has(jobId)) return prev;
      const next = new Set(prev);
      next.add(jobId);
      return next;
    });
    setJobs((current) => current.filter((item) => item.jobId !== jobId));
  }, []);

  const cards = useMemo(() => {
    if (
      !focusedJobId
      || suppressedJobIds.has(focusedJobId)
      || jobs.some((job) => job.jobId === focusedJobId)
    ) {
      return jobs;
    }
    return [optimisticJobCard(focusedJobId), ...jobs];
  }, [focusedJobId, jobs, suppressedJobIds]);

  useEffect(() => {
    const ac = new AbortController();
    const refreshIfNeeded = (jobId: string) => {
      onMediaRefresh?.();
      const active = readActiveGeneration();
      if (active?.jobId === jobId) clearActiveGeneration();
    };

    const pollOne = (card: MediaJobCard) => {
      if (card.status !== "reserved") return;
      void pollGenerationJob({
        jobId: card.jobId,
        expectedVariants: card.expectedVariants,
        signal: ac.signal,
        onProgress: (_message, result) => {
          if (result.status === "failed") return;
          mergeJob({
            ...card,
            ...cardFromJob({ id: card.jobId, status: result.status || "reserved", result }, Boolean(card.highlighted), card),
            connectionIssue: result.connectionIssue,
            pending: result.pending,
          });
        },
      }).then((result) => {
        if (ac.signal.aborted) return;
        const status =
          result.status || (result.error ? "failed" : result.pending ? "reserved" : "completed");
        if (status === "failed" && !result.pending) {
          dismissJob(card.jobId);
          if (!result.connectionIssue) refreshIfNeeded(card.jobId);
          return;
        }
        const next = {
          ...card,
          ...cardFromJob(
            { id: card.jobId, status, result },
            Boolean(card.highlighted),
            card,
          ),
          connectionIssue: result.connectionIssue,
          pending: result.pending,
          error: result.error,
        };
        mergeJob(next);
        if (!result.pending && !result.connectionIssue && result.images?.length) {
          refreshIfNeeded(card.jobId);
        }
      });
    };

    void (async () => {
      try {
        const listed: JobsApiJob[] = [];
        const listRes = await fetch("/api/dashboard/jobs", {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (listRes.ok) {
          const listJson = (await listRes.json()) as { jobs?: JobsApiJob[] };
          if (Array.isArray(listJson.jobs)) {
            listed.push(...listJson.jobs.filter((job) => isLiveListedJob(job, focusedJobId)));
          }
        }
        if (focusedJobId && !listed.some((job) => job.id === focusedJobId)) {
          const oneRes = await fetch(`/api/dashboard/jobs?id=${encodeURIComponent(focusedJobId)}`, {
            credentials: "include",
            cache: "no-store",
            signal: ac.signal,
          });
          if (oneRes.ok) {
            const oneJson = (await oneRes.json()) as { job?: JobsApiJob };
            if (oneJson.job?.id) {
              if (oneJson.job.status === "failed") {
                dismissJob(focusedJobId);
              } else {
                listed.unshift(oneJson.job);
              }
            }
          } else if (oneRes.status === 404) {
            dismissJob(focusedJobId);
          }
        }
        const nextCards = listed
          .filter((job) => job.status !== "failed")
          .map((job) => cardFromJob(job, job.id === focusedJobId));
        setJobs((current) => {
          const byId = new Map(nextCards.map((job) => [job.jobId, job]));
          for (const job of current) {
            if (byId.has(job.jobId)) continue;
            // Nur laufende Jobs aus dem Session-State behalten — Failures nicht „dauerhaft“ mergen.
            if (job.status === "reserved") byId.set(job.jobId, job);
          }
          return [...byId.values()];
        });
        for (const card of nextCards) pollOne(card);
      } catch (error) {
        if (ac.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      }
    })();

    return () => ac.abort();
  }, [dismissJob, focusedJobId, mergeJob, onMediaRefresh, pollNonce]);

  return { jobs: cards, recheck: () => setPollNonce((n) => n + 1) };
}

/** Signierte Storage-URL für Kacheln (Thumb falls vorhanden). */
export function getMediaThumbUrl(item: MediaItem): string {
  return item.thumbUrl?.trim() || item.imageUrl;
}

/** Original für Großansicht — direkt, ohne Download-Proxy. */
export function getMediaFullUrl(item: MediaItem): string {
  return item.imageUrl;
}

/** Nur für Datei-Download (Format/Attachment). */
export function getMediaDownloadUrl(item: MediaItem): string {
  if (item.imageUrl.startsWith("data:") || item.imageUrl.startsWith("/api/kie/download?")) {
    return item.imageUrl;
  }
  return `/api/kie/download?url=${encodeURIComponent(item.imageUrl)}&format=${item.outputFormat}&taskId=${encodeURIComponent(item.id)}`;
}

/** @deprecated Prefer getMediaFullUrl / getMediaThumbUrl / getMediaDownloadUrl */
export function getMediaAssetUrl(item: MediaItem): string {
  return getMediaDownloadUrl(item);
}

export async function downloadMediaItem(item: MediaItem): Promise<string | null> {
  const response = await fetch(getMediaDownloadUrl(item));
  if (!response.ok) {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error ?? "Download fehlgeschlagen.";
    } catch {
      return "Download fehlgeschlagen.";
    }
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `brewai-${item.id}.${item.outputFormat}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
  return null;
}

export type StudioMediaLibraryProps = {
  items: MediaItem[];
  loaded?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onItemsChange: (next: MediaItem[]) => void;
  onMediaRefresh?: () => void;
  hasActivePlan?: boolean;
  /** false = Viewer: keine Generierung/Löschen. */
  canWriteMedia?: boolean;
  initialQuery?: string;
  focusedJobId?: string;
  /** QA only: skip real download fetch */
  mockDownload?: boolean;
  mediaTotal?: number;
  hasMoreMedia?: boolean;
  loadingMoreMedia?: boolean;
  onLoadMoreMedia?: () => void;
};

export function StudioMediaLibrary({
  items,
  loaded = true,
  loadError = null,
  onRetry,
  onItemsChange,
  onMediaRefresh,
  hasActivePlan = true,
  canWriteMedia = true,
  initialQuery = "",
  focusedJobId = "",
  mockDownload = false,
  mediaTotal,
  hasMoreMedia = false,
  loadingMoreMedia = false,
  onLoadMoreMedia,
}: StudioMediaLibraryProps) {
  const reduceMotion = useReducedMotion();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(initialQuery);
  const [beerFilter, setBeerFilter] = useState<string | null>(null);
  const [beerPopoverOpen, setBeerPopoverOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  const [assortmentBeers, setAssortmentBeers] = useState<DashboardBeer[]>([]);
  const [sortOrder, setSortOrder] = useState<MediaSortOrder>("newest");
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { jobs, recheck } = useStudioJobCards(focusedJobId, onMediaRefresh);

  useEffect(() => {
    // Sync URL query param when navigating with ?q=
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled by route search param
    setSearch(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!selectedItem) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form when opening detail
    setTitleDraft(getMediaDisplayTitle(selectedItem));
    setTitleError(null);
    const focusTimer = window.setTimeout(() => titleInputRef.current?.focus(), reduceMotion ? 0 : 180);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedItem, reduceMotion]);

  const openMediaItem = useCallback((item: MediaItem) => {
    setDownloadError(null);
    setTitleError(null);
    setSelectedItem(item);
  }, []);

  const exitSelecting = useCallback(() => {
    setSelecting(false);
    setSelectedIds([]);
    setDeleteError(null);
    setConfirmDeleteOpen(false);
  }, []);

  useEffect(() => {
    if (!selecting || selectedItem || confirmDeleteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitSelecting();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting, selectedItem, confirmDeleteOpen, exitSelecting]);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  const deleteMediaIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setDeleting(true);
      setDeleteError(null);
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/dashboard/media?id=${encodeURIComponent(id)}`, {
              method: "DELETE",
              credentials: "same-origin",
            });
            if (!res.ok) {
              const json = (await res.json().catch(() => null)) as { error?: string } | null;
              return { id, error: json?.error ?? "Löschen fehlgeschlagen." };
            }
            return { id, error: null as string | null };
          }),
        );
        const failed = results.filter((result) => result.error);
        const removed = new Set(results.filter((result) => !result.error).map((result) => result.id));
        if (removed.size > 0) {
          onItemsChange(items.filter((item) => !removed.has(item.id)));
          setSelectedItem((current) => (current && removed.has(current.id) ? null : current));
          setSelectedIds((current) => current.filter((id) => !removed.has(id)));
          onMediaRefresh?.();
        }
        if (failed.length > 0) {
          setDeleteError(
            failed.length === ids.length
              ? failed[0]?.error ?? "Löschen fehlgeschlagen."
              : `${failed.length} von ${ids.length} Motiven konnten nicht gelöscht werden.`,
          );
          return;
        }
        setConfirmDeleteOpen(false);
        if (selecting) exitSelecting();
      } catch {
        setDeleteError("Löschen fehlgeschlagen.");
      } finally {
        setDeleting(false);
      }
    },
    [exitSelecting, items, onItemsChange, onMediaRefresh, selecting],
  );

  const saveMediaTitle = useCallback(
    async (item: MediaItem, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed) {
        setTitleError("Bitte einen Titel eingeben.");
        return;
      }
      if (trimmed === getMediaDisplayTitle(item)) return;

      setTitleSaving(true);
      setTitleError(null);
      try {
        const res = await fetch("/api/dashboard/media", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, title: trimmed }),
        });
        const json = (await res.json().catch(() => null)) as
          | { error?: string; items?: MediaItem[]; id?: string; title?: string }
          | null;
        if (!res.ok) {
          setTitleError(json?.error ?? "Titel konnte nicht gespeichert werden.");
          return;
        }
        const nextTitle = json?.title?.trim() || trimmed;
        const nextItems = Array.isArray(json?.items)
          ? json.items
          : items.map((entry) => (entry.id === item.id ? { ...entry, title: nextTitle } : entry));
        onItemsChange(nextItems);
        setSelectedItem((current) => (current?.id === item.id ? { ...current, title: nextTitle } : current));
      } catch {
        setTitleError("Titel konnte nicht gespeichert werden.");
      } finally {
        setTitleSaving(false);
      }
    },
    [items, onItemsChange],
  );

  const handleDownload = useCallback(
    async (item: MediaItem) => {
      setDownloading(true);
      setDownloadError(null);
      try {
        if (mockDownload) {
          await new Promise((r) => setTimeout(r, 400));
          return;
        }
        const error = await downloadMediaItem(item);
        if (error) setDownloadError(error);
      } catch {
        setDownloadError("Download fehlgeschlagen.");
      } finally {
        setDownloading(false);
      }
    },
    [mockDownload],
  );

  useEffect(() => {
    setSortOrder(readMediaSortOrder());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MEDIA_SORT_KEY, sortOrder);
    } catch {
      /* ignore */
    }
  }, [sortOrder]);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/my-beers", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { beers?: DashboardBeer[] };
        if (!ignore && Array.isArray(data.beers)) setAssortmentBeers(data.beers);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const beerOptions = useMemo(() => {
    const byName = new Map<string, { id: string; name: string; count: number }>();
    for (const beer of assortmentBeers) {
      const name = beer.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, { id: beer.id, name, count: 0 });
    }
    for (const option of byName.values()) {
      option.count = items.reduce(
        (sum, item) => sum + (mediaMatchesBeer(item, option) ? 1 : 0),
        0,
      );
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [assortmentBeers, items]);

  useEffect(() => {
    if (beerFilter && !beerOptions.some((option) => option.name === beerFilter)) {
      setBeerFilter(null);
    }
  }, [beerFilter, beerOptions]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeBeer = beerFilter
      ? beerOptions.find((option) => option.name === beerFilter) ?? { name: beerFilter }
      : null;
    const filtered = items.filter((it) => {
      if (activeBeer && !mediaMatchesBeer(it, activeBeer)) return false;
      if (!q) return true;
      return (
        getMediaDisplayTitle(it).toLowerCase().includes(q) ||
        (it.beerName?.toLowerCase().includes(q) ?? false) ||
        it.prompt.toLowerCase().includes(q) ||
        it.aspectRatio.toLowerCase().includes(q) ||
        it.resolution.toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      const da = Date.parse(a.createdAt) || 0;
      const db = Date.parse(b.createdAt) || 0;
      return sortOrder === "newest" ? db - da : da - db;
    });
  }, [items, search, beerFilter, beerOptions, sortOrder]);

  const mediaIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const visibleJobs = useMemo(
    () => jobs.filter((job) => shouldShowJobCard(job, mediaIds)),
    [jobs, mediaIds],
  );
  const { leading, seen } = useMemo(
    () => leadingMediaForJobs(jobs, visibleItems),
    [jobs, visibleItems],
  );
  const restItems = useMemo(
    () => visibleItems.filter((item) => !seen.has(item.id)),
    [visibleItems, seen],
  );
  const hasAny = visibleJobs.length > 0 || items.length > 0;
  const freshJobPrefixes = useMemo(() => jobs.map((job) => `gen-${job.jobId}-`), [jobs]);

  const createHref = !canWriteMedia ? null : hasActivePlan ? "/inhalte-erstellen" : "/dashboard/pricing";
  const createLabel = !canWriteMedia ? "Nur Lesen" : hasActivePlan ? "Bild erstellen" : "Tarif wählen";

  return (
    <div data-content-padding="false" className="flex min-h-[calc(100dvh-var(--dashboard-header-height,3rem))] flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl leading-none tracking-tight">Mediathek</h1>
            <p className="text-muted-foreground text-sm">
              {selecting
                ? "Motive antippen, um sie zum Löschen auszuwählen."
                : "Fertige Motive und laufende Aufträge an einem Ort."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selecting ? (
              <>
                <Button type="button" variant="outline" disabled={deleting} onClick={exitSelecting}>
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={selectedIds.length === 0 || deleting}
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmDeleteOpen(true);
                  }}
                >
                  {selectedIds.length > 0
                    ? `${selectedIds.length} ${selectedIds.length === 1 ? "Motiv" : "Motive"} löschen`
                    : "Löschen"}
                </Button>
              </>
            ) : (
              <>
                {loaded && items.length > 0 && canWriteMedia ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedItem(null);
                      setSelecting(true);
                      setSelectedIds([]);
                      setDeleteError(null);
                    }}
                  >
                    Auswählen
                  </Button>
                ) : null}
                {loaded && beerOptions.length > 0 ? (
                  <Popover open={beerPopoverOpen} onOpenChange={setBeerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline">
                        {beerFilter ? `Sorte · ${beerFilter}` : "Sorte"}
                        <ChevronDown data-icon="inline-end" className="opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-2">
                      <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                        Hinterlegte Biersorten
                      </div>
                      <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                            beerFilter === null ? "bg-muted font-medium" : ""
                          }`}
                          onClick={() => {
                            setBeerFilter(null);
                            setBeerPopoverOpen(false);
                          }}
                        >
                          Alle Motive
                          <span className="text-muted-foreground tabular-nums">{items.length}</span>
                        </button>
                        {beerOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                              beerFilter === option.name ? "bg-muted font-medium" : ""
                            }`}
                            onClick={() => {
                              setBeerFilter(option.name);
                              setBeerPopoverOpen(false);
                            }}
                          >
                            <span className="min-w-0 truncate">{option.name}</span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">{option.count}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
                {/* Früher zusätzlich „Zur Einstiegsseite“ — führte auf dieselbe Seite wie der Hauptbutton. */}
                {createHref ? (
                  <Button asChild>
                    <Link href={createHref}>
                      <ImagePlus data-icon="inline-start" />
                      {createLabel}
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" disabled>
                    {createLabel}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {loaded && hasAny ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nach Motiv, Bier oder Anlass suchen …"
                aria-label="Mediathek durchsuchen"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" aria-label="Sortierung nach Zeit">
                    {sortOrder === "newest" ? "Neueste zuerst" : "Älteste zuerst"}
                    <ChevronDown data-icon="inline-end" className="opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-2">
                  <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">Sortierung</div>
                  <div className="flex flex-col gap-0.5">
                    {(
                      [
                        { value: "newest", label: "Neueste zuerst" },
                        { value: "oldest", label: "Älteste zuerst" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                          sortOrder === option.value ? "bg-muted font-medium" : ""
                        }`}
                        onClick={() => {
                          setSortOrder(option.value);
                          setSortPopoverOpen(false);
                        }}
                      >
                        {option.label}
                        {sortOrder === option.value ? (
                          <Check className="size-4 shrink-0 opacity-70" aria-hidden />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Badge variant="secondary">
                Bilder · {beerFilter || search.trim() ? visibleItems.length : (mediaTotal ?? items.length)}
              </Badge>
            </div>
          </div>
        ) : null}

        <LayoutGroup id="studio-media-library">
          {!loaded && visibleJobs.length === 0 ? (
            <div
              className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5"
              aria-busy="true"
            >
              {Array.from({ length: 5 }, (_, i) => (
                <Card
                  key={i}
                  className="mb-3 break-inside-avoid gap-0 overflow-hidden py-0 shadow-sm"
                >
                  <Skeleton className="aspect-[4/5] w-full rounded-none" />
                  <CardContent className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : loadError && !hasAny ? (
            <Card>
              <CardHeader>
                <CardTitle>Mediathek nicht erreichbar</CardTitle>
                <CardDescription className="text-destructive">{loadError}</CardDescription>
              </CardHeader>
              {onRetry ? (
                <CardContent>
                  <Button variant="outline" onClick={onRetry}>
                    Erneut laden
                  </Button>
                </CardContent>
              ) : null}
            </Card>
          ) : !hasAny ? (
            <Card>
              <CardHeader>
                <CardTitle>Noch keine Motive in der Mediathek</CardTitle>
                <CardDescription>
                  Wähle Sorte und Anlass und erstelle dein erstes Motiv — es landet automatisch hier.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {createHref ? (
                  <Button asChild>
                    <Link href={createHref}>{hasActivePlan ? "Erstes Motiv erstellen" : "Tarif wählen"}</Link>
                  </Button>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Deine Rolle ist „Nur Lesen“ — Motive erzeugen kann ein Teammitglied mit Bearbeiten-Rechten.
                  </p>
                )}
                <Button variant="outline" asChild>
                  <Link href="/dashboard/brand">Markenprofil prüfen</Link>
                </Button>
              </CardContent>
            </Card>
          ) : visibleJobs.length === 0 && visibleItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">Keine Motive passen zur Suche.</p>
          ) : (
            <div className="media-grid columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
              {visibleJobs.map((job) => {
                const message = jobProgressMessage({
                  phase: job.phase,
                  status: job.status,
                  completed: job.images.length,
                  expected: job.expectedVariants,
                  connectionIssue: job.connectionIssue,
                });
                return (
                  <Card
                    key={`job-${job.jobId}`}
                    className="media-tile mb-3 break-inside-avoid gap-0 overflow-hidden border-0 py-0 shadow-sm"
                    aria-busy={job.status === "reserved" || undefined}
                    aria-label={message}
                  >
                    <MediaJobRevealThumb job={job} message={message} />
                    <CardContent className="space-y-1 p-3">
                      <p className="truncate text-sm font-medium">{message}</p>
                      <p className="text-muted-foreground text-xs">
                        {job.aspectRatio}
                        {job.expectedVariants > 1 ? ` · ${job.images.length}/${job.expectedVariants}` : ""}
                        {job.partial ? " · teilweise" : ""}
                      </p>
                      {job.error && !job.pending ? (
                        <p className="text-destructive text-xs">{job.error}</p>
                      ) : null}
                      {job.pending || job.connectionIssue ? (
                        <Button type="button" variant="ghost" size="sm" className="h-auto px-0" onClick={recheck}>
                          Status erneut prüfen
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
              {[...leading, ...restItems].map((it) => {
                const isSelected = selectedIds.includes(it.id);
                // Frisch aus einem Job übernommen: kein Einflug, sondern Übergabe + kurzer Glanz.
                const isFresh = freshJobPrefixes.some((prefix) => it.id.startsWith(prefix));
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={cn(
                      "media-tile group/tile relative mb-3 w-full break-inside-avoid overflow-hidden rounded-xl border-0 bg-card text-left shadow-sm outline-none transition-[background-color,box-shadow,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_14px_30px_-16px_rgb(0_0_0/0.3)] focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:hover:translate-y-0",
                      focusedJobId && it.id.startsWith(`gen-${focusedJobId}-`) && !selecting && "ring-2 ring-primary/50",
                      isFresh && "media-tile--fresh",
                    )}
                    onClick={() => {
                      if (selecting) {
                        toggleSelectedId(it.id);
                        return;
                      }
                      openMediaItem(it);
                    }}
                    aria-pressed={selecting ? isSelected : undefined}
                    aria-label={
                      selecting
                        ? `${getMediaDisplayTitle(it)} ${isSelected ? "abwählen" : "auswählen"}`
                        : `${getMediaDisplayTitle(it)} in Großansicht öffnen`
                    }
                  >
                    <div className="relative w-full overflow-hidden bg-muted" style={jobAspectStyle(it.aspectRatio)}>
                      <div
                        className={cn(
                          "size-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                          !selecting && "group-hover/tile:scale-[1.04] motion-reduce:group-hover/tile:scale-100",
                        )}
                      >
                      <motion.img
                        ref={markMediaImgLoaded}
                        onLoad={(event) => {
                          event.currentTarget.dataset.loaded = "1";
                        }}
                        className={cn(
                          "media-tile-img block h-full w-full object-cover transition-[filter,opacity] duration-500",
                          selecting && isSelected && "blur-[2.5px] opacity-90",
                        )}
                        layoutId={reduceMotion || selecting ? undefined : `studio-media-${it.id}`}
                        src={getMediaThumbUrl(it)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        transition={reduceMotion ? { duration: 0 } : MEDIA_LIGHTBOX_SPRING}
                      />
                      </div>
                      {selecting && isSelected ? (
                        <span aria-hidden className="pointer-events-none absolute inset-0 bg-white/25 backdrop-blur-[2px]" />
                      ) : null}
                      {selecting ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border-0 shadow-none backdrop-blur-md transition-[background-color,color,scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                            isSelected ? "scale-110" : "scale-100",
                            isSelected
                              ? "bg-primary/90 text-primary-foreground"
                              : "bg-white/55 text-transparent",
                          )}
                        >
                          <Check className="size-3.5" strokeWidth={2.5} />
                        </span>
                      ) : mediaPhotoStyleLabel(it.photoStyle) ? (
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="absolute top-2 left-2 border-0 bg-black/55 text-white shadow-none backdrop-blur-sm"
                        >
                          {mediaPhotoStyleLabel(it.photoStyle)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-0.5 p-3">
                      <p className="truncate text-sm font-medium">{clampText(getMediaDisplayTitle(it), 48)}</p>
                      <p className="text-muted-foreground text-xs">
                        {it.aspectRatio} · {formatRelativeTime(it.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {hasMoreMedia && onLoadMoreMedia ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMoreMedia}
                onClick={onLoadMoreMedia}
              >
                {loadingMoreMedia ? "Lädt …" : "Weitere Motive laden"}
              </Button>
            </div>
          ) : null}

          <AnimatePresence>
            {selectedItem ? (
              <motion.div
                key="studio-media-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label="Bild in Großansicht"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: STUDIO_EASE }}
                onClick={() => setSelectedItem(null)}
                className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
              >
                <motion.div
                  onClick={(event) => event.stopPropagation()}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: STUDIO_EASE }}
                  className={cn(
                    "flex max-h-[90dvh] w-full overflow-hidden rounded-xl bg-card shadow-lg",
                    isLandscapeAspect(selectedItem.aspectRatio)
                      ? "max-w-5xl flex-col md:flex-row"
                      : "max-w-3xl flex-col md:flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "relative flex min-h-0 items-center justify-center bg-muted p-3 sm:p-5",
                      isLandscapeAspect(selectedItem.aspectRatio)
                        ? "md:min-w-0 md:flex-1"
                        : "md:w-[min(100%,26rem)] md:flex-none",
                    )}
                  >
                    {mediaPhotoStyleLabel(selectedItem.photoStyle) ? (
                      <Badge
                        variant="secondary"
                        size="sm"
                        className="absolute top-4 left-4 z-[1] border-0 bg-black/55 text-white shadow-none backdrop-blur-sm sm:top-6 sm:left-6"
                      >
                        {mediaPhotoStyleLabel(selectedItem.photoStyle)}
                      </Badge>
                    ) : null}
                    <motion.img
                      className="h-auto max-h-[min(70dvh,720px)] w-auto max-w-full object-contain"
                      style={jobAspectStyle(selectedItem.aspectRatio)}
                      layoutId={reduceMotion ? undefined : `studio-media-${selectedItem.id}`}
                      src={getMediaFullUrl(selectedItem)}
                      alt={getMediaDisplayTitle(selectedItem)}
                      decoding="async"
                      transition={reduceMotion ? { duration: 0 } : MEDIA_LIGHTBOX_SPRING}
                    />
                  </div>
                  <motion.aside
                    className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:max-w-sm md:p-6"
                    initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.32, delay: reduceMotion ? 0 : 0.1, ease: STUDIO_EASE }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <label htmlFor={`media-title-${selectedItem.id}`} className="text-muted-foreground text-xs font-medium">
                          Motiv-Titel
                        </label>
                        <Input
                          id={`media-title-${selectedItem.id}`}
                          ref={titleInputRef}
                          value={titleDraft}
                          onChange={(event) => setTitleDraft(event.target.value)}
                          onBlur={() => {
                            if (selectedItem) void saveMediaTitle(selectedItem, titleDraft);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              if (selectedItem) void saveMediaTitle(selectedItem, titleDraft);
                            }
                          }}
                          maxLength={120}
                          disabled={titleSaving}
                          placeholder="z. B. Hefeweizen · Hero-Glas"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={titleSaving || titleDraft.trim() === getMediaDisplayTitle(selectedItem)}
                            onClick={() => void saveMediaTitle(selectedItem, titleDraft)}
                          >
                            Titel speichern
                          </Button>
                          <span className="text-muted-foreground text-xs">
                            {[
                              mediaPhotoStyleLabel(selectedItem.photoStyle),
                              selectedItem.resolution,
                              selectedItem.aspectRatio,
                              selectedItem.outputFormat.toUpperCase(),
                              formatRelativeTime(selectedItem.createdAt),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Schließen" onClick={() => setSelectedItem(null)}>
                        <X />
                      </Button>
                    </div>
                    {titleError ? <p className="text-destructive text-sm">{titleError}</p> : null}
                    {titleSaving ? <p className="text-muted-foreground text-sm">Titel wird gespeichert …</p> : null}
                    {selectedItem.prompt?.trim() ? (
                      <div className="space-y-1.5">
                        <p className="text-muted-foreground text-xs font-medium">Prompt</p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {selectedItem.prompt.trim()}
                        </p>
                      </div>
                    ) : null}
                    {downloadError ? <p className="text-destructive text-sm">{downloadError}</p> : null}
                    {deleteError && !selecting ? <p className="text-destructive text-sm">{deleteError}</p> : null}
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button disabled={downloading || deleting} onClick={() => void handleDownload(selectedItem)}>
                        {downloading ? "Wird heruntergeladen …" : "Herunterladen"}
                      </Button>
                      {canWriteMedia ? (
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={deleting || downloading}
                          onClick={() => {
                            setDeleteError(null);
                            setSelectedIds([selectedItem.id]);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          Löschen
                        </Button>
                      ) : null}
                      <Button variant="outline" disabled={deleting} onClick={() => setSelectedItem(null)}>
                        Schließen
                      </Button>
                    </div>
                  </motion.aside>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </LayoutGroup>

        {selecting && deleteError ? (
          <p className="text-destructive text-sm" role="alert">
            {deleteError}
          </p>
        ) : null}

        <AlertDialog
          open={confirmDeleteOpen}
          onOpenChange={(open) => {
            if (deleting) return;
            setConfirmDeleteOpen(open);
            if (!open && !selecting) setSelectedIds([]);
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedIds.length === 1 ? "Motiv löschen?" : `${selectedIds.length} Motive löschen?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedIds.length === 1
                  ? "Das Motiv wird dauerhaft aus der Mediathek entfernt."
                  : "Die ausgewählten Motive werden dauerhaft aus der Mediathek entfernt."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || selectedIds.length === 0}
                onClick={() => void deleteMediaIds(selectedIds)}
              >
                {deleting ? "Wird gelöscht …" : "Löschen"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

/** @deprecated Use StudioMediaLibrary */
export const MediaView = StudioMediaLibrary;

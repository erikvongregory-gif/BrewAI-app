"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BEER_STYLE_OPTIONS,
  beerStyleLabel,
  findBeerStyle,
} from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import {
  FLASCHEN_TYPEN,
  flascheForKategorie,
  flaschenGruppen,
  GLAS_TYPEN,
  isDoseTyp,
  type FlaschenTyp,
  type GlasTyp,
} from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
import { readAndCompressImage } from "@/lib/images/compress-image";
import { GETRANKEART_OPTIONS, sanitizeProduktKategorie, type ProduktKategorie } from "@/lib/dashboard/metadata";

const EASE = [0.2, 0.7, 0.2, 1] as const;
const PILL_SPRING: Transition = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 };
const INSTANT: Transition = { duration: 0 };
const noopSubscribe = () => () => {};

const GLAS_CHOICES = (Object.entries(GLAS_TYPEN) as [GlasTyp, (typeof GLAS_TYPEN)[GlasTyp]][]).map(
  ([code, item]) => ({
    code,
    label: item.label,
  }),
);

const FARBE_CHOICES = [
  { code: "braun" as const, label: "Braun", swatch: "#6b4423" },
  { code: "gruen" as const, label: "Grün", swatch: "#2f5d3a" },
  { code: "klar" as const, label: "Klar", swatch: "#c8d0d8" },
];

const FARBE_LABEL: Record<(typeof FARBE_CHOICES)[number]["code"], string> = {
  braun: "Braune Flasche",
  gruen: "Grüne Flasche",
  klar: "Klare Flasche",
};

const FILTRIERUNG_CHOICES = [
  { code: "filtriert" as const, label: "Filtriert · klar" },
  { code: "unfiltriert" as const, label: "Unfiltriert · trüb" },
];

const DOSE_SWATCH = "linear-gradient(145deg, #c9c9c9, #6e6e6e)";

export type BeerCreateDraft = {
  name: string;
  produktKategorie: ProduktKategorie;
  bierstil: string;
  flaschenTyp: string;
  flaschenfarbe: "braun" | "gruen" | "klar";
  glasTyp: string;
  filtrierung: "filtriert" | "unfiltriert";
  etikettDataUrl: string;
};

export type BeerCreateInitial = {
  name?: string;
  produktKategorie?: ProduktKategorie;
  bierstil?: string;
  flaschenTyp?: string;
  flaschenfarbe?: "braun" | "gruen" | "klar";
  glasTyp?: string;
  filtrierung?: "filtriert" | "unfiltriert";
  /** Bestehende HTTPS-URL — wird als Vorschau gezeigt, bis ein neues Foto kommt. */
  etikettUrl?: string;
};

type SavePhase = "idle" | "saving" | "success";

function BottleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 64" fill="none" aria-hidden="true">
      <path
        d="M13 4h6v6c0 2 1.2 3.2 1.2 5.4V18c2.4 1.2 4 3.6 4 6.4v28.2c0 3.2-2.6 5.4-5.8 5.4h-4.8c-3.2 0-5.8-2.2-5.8-5.4V24.4c0-2.8 1.6-5.2 4-6.4v-2.6C11.8 13.2 13 12 13 10V4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12.5 4.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ReplaceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function defaultFiltrierung(bierstil: string): "filtriert" | "unfiltriert" {
  return /hefeweizen|kellerbier|neipa|zwickel|rauchbier/i.test(bierstil) ? "unfiltriert" : "filtriert";
}

type PromptToken = { key: string; label: string; strong?: boolean };

function buildPromptTokens(parts: {
  name: string;
  produktKategorie: ProduktKategorie;
  bierstil: string;
  flaschenTyp: string;
  flaschenfarbe: "braun" | "gruen" | "klar";
  glasTyp: string;
  filtrierung: "filtriert" | "unfiltriert";
  brandTone: string;
}): PromptToken[] {
  const tokens: PromptToken[] = [];
  if (parts.name.trim()) tokens.push({ key: "name", label: parts.name.trim(), strong: true });
  const style = parts.produktKategorie === "bier"
    ? beerStyleLabel(parts.bierstil)
    : GETRANKEART_OPTIONS.find((option) => option.id === parts.produktKategorie)?.label;
  if (style) tokens.push({ key: "style", label: style });
  if (parts.produktKategorie === "bier") {
    tokens.push({
      key: "filter",
      label: parts.filtrierung === "unfiltriert" ? "unfiltriert / naturtrüb" : "filtriert / klar",
    });
  }
  const vessel =
    parts.flaschenTyp in FLASCHEN_TYPEN
      ? FLASCHEN_TYPEN[parts.flaschenTyp as FlaschenTyp].pillLabel
      : undefined;
  if (vessel) tokens.push({ key: "vessel", label: vessel });
  if (!isDoseTyp(parts.flaschenTyp as keyof typeof FLASCHEN_TYPEN)) {
    tokens.push({ key: "color", label: FARBE_LABEL[parts.flaschenfarbe] });
  }
  const glass = GLAS_CHOICES.find((g) => g.code === parts.glasTyp)?.label;
  if (glass) tokens.push({ key: "glass", label: glass });
  const tone = parts.brandTone.trim();
  if (tone) tokens.push({ key: "tone", label: `Markenstil „${tone}“` });
  return tokens;
}

/** Chip mit gleitender Auswahl-Pille (shared layout). */
function Chip({
  on,
  pillId,
  disabled,
  reducedMotion,
  onClick,
  children,
  className = "",
}: {
  on: boolean;
  pillId: string;
  disabled?: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`studio-beer-create-chip${on ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      {on ? (
        <motion.span
          layoutId={pillId}
          className="studio-beer-create-chip-pill"
          transition={reducedMotion ? INSTANT : PILL_SPRING}
          aria-hidden="true"
        />
      ) : null}
      <span className="studio-beer-create-chip-label">{children}</span>
    </button>
  );
}

function Section({
  index,
  title,
  aside,
  motionProps,
  children,
}: {
  index: string;
  title: string;
  aside?: ReactNode;
  motionProps: object;
  children: ReactNode;
}) {
  return (
    <motion.section className="studio-beer-create-section" {...motionProps}>
      <header className="studio-beer-create-section-head">
        <span className="studio-beer-create-section-index">{index}</span>
        <span className="studio-beer-create-section-title">{title}</span>
        <span className="studio-beer-create-section-rule" aria-hidden="true" />
        {aside}
      </header>
      {children}
    </motion.section>
  );
}

function PromptPreview({
  tokens,
  swatch,
  reducedMotion,
}: {
  tokens: PromptToken[];
  swatch: string | undefined;
  reducedMotion: boolean;
}) {
  return (
    <div className="studio-beer-create-preview">
      <div className="studio-beer-create-preview-head">
        <span className="studio-beer-create-preview-label">So geht die Sorte in den Prompt</span>
        <motion.span
          className="studio-beer-create-preview-swatch"
          animate={{ background: swatch }}
          transition={{ duration: reducedMotion ? 0 : 0.25, ease: EASE }}
          aria-hidden="true"
        />
      </div>
      <div className="studio-beer-create-preview-tokens" aria-live="polite">
        {tokens.length === 0 ? (
          <span className="studio-beer-create-preview-empty">Name, Stil und Flasche erscheinen hier.</span>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {tokens.map((token) => (
              <motion.span
                key={`${token.key}:${token.label}`}
                layout={reducedMotion ? false : "position"}
                className={`studio-beer-create-token${token.strong ? " is-strong" : ""}`}
                initial={reducedMotion ? false : { opacity: 0, y: 6, scale: 0.94, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={reducedMotion ? undefined : { opacity: 0, scale: 0.92, filter: "blur(2px)" }}
                transition={reducedMotion ? INSTANT : { duration: 0.24, ease: EASE }}
              >
                {token.label}
              </motion.span>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

export function BeerCreatePanel({
  brandTone = "",
  error = "",
  initialKategorie = "bier",
  initial,
  mode = "create",
  reducedMotion: reducedMotionProp,
  onSave,
  onCancel,
  onDelete,
}: {
  brandTone?: string;
  error?: string;
  initialKategorie?: ProduktKategorie;
  initial?: BeerCreateInitial;
  mode?: "create" | "edit";
  reducedMotion?: boolean;
  onSave: (draft: BeerCreateDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const reducedMotionHook = useReducedMotion() ?? false;
  const reducedMotion = reducedMotionProp ?? reducedMotionHook;
  const uid = useId();
  const fileInputId = `${uid}-file`;
  const nameInputId = `${uid}-name`;
  const fileRef = useRef<HTMLInputElement>(null);

  const startKategorie = sanitizeProduktKategorie(initial?.produktKategorie ?? initialKategorie);
  const [manualOnly, setManualOnly] = useState(false);
  const [name, setName] = useState(initial?.name?.trim() ?? "");
  const [produktKategorie, setProduktKategorie] = useState<ProduktKategorie>(startKategorie);
  const [bierstil, setBierstil] = useState(
    initial?.bierstil?.trim() || (startKategorie === "bier" ? "helles" : startKategorie),
  );
  const [flaschenTyp, setFlaschenTyp] = useState(
    flascheForKategorie(startKategorie, initial?.flaschenTyp?.trim()),
  );
  const [flaschenfarbe, setFlaschenfarbe] = useState<"braun" | "gruen" | "klar">(
    initial?.flaschenfarbe ?? (startKategorie === "bier" ? "braun" : "klar"),
  );
  const [glasTyp, setGlasTyp] = useState<GlasTyp>(
    (initial?.glasTyp?.trim() as GlasTyp | undefined) ||
      findBeerStyle(initial?.bierstil?.trim() || "helles")?.glasTyp ||
      "willibecher",
  );
  const [filtrierung, setFiltrierung] = useState<"filtriert" | "unfiltriert">(
    initial?.filtrierung === "unfiltriert" || initial?.filtrierung === "filtriert"
      ? initial.filtrierung
      : defaultFiltrierung(initial?.bierstil?.trim() || "helles"),
  );
  const [etikettDataUrl, setEtikettDataUrl] = useState("");
  const [existingEtikettUrl] = useState(initial?.etikettUrl?.trim() || "");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [localError, setLocalError] = useState("");
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveShortcut = useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘↵" : "Strg ↵"),
    () => "Strg ↵",
  );

  // Snapshot der Ausgangswerte — für „Ungespeicherte Änderungen“.
  const [baseline] = useState(() => ({
    name: initial?.name?.trim() ?? "",
    produktKategorie,
    bierstil,
    flaschenTyp,
    flaschenfarbe,
    glasTyp,
    filtrierung,
  }));

  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);

  const previewImage = etikettDataUrl || existingEtikettUrl;
  const isEdit = mode === "edit";
  const isBier = produktKategorie === "bier";
  const flaschenGroups = flaschenGruppen(produktKategorie);
  const showDose = isDoseTyp(flaschenTyp as keyof typeof FLASCHEN_TYPEN);
  const tokens = buildPromptTokens({
    name,
    produktKategorie,
    bierstil,
    flaschenTyp,
    flaschenfarbe,
    glasTyp,
    filtrierung,
    brandTone,
  });
  const previewSwatch = showDose ? DOSE_SWATCH : FARBE_CHOICES.find((f) => f.code === flaschenfarbe)?.swatch;
  const displayError = localError || error || uploadError;
  const busy = phase === "saving" || phase === "success" || deleting;
  const dirty =
    name.trim() !== baseline.name ||
    produktKategorie !== baseline.produktKategorie ||
    (isBier && (bierstil !== baseline.bierstil || filtrierung !== baseline.filtrierung)) ||
    flaschenTyp !== baseline.flaschenTyp ||
    (!showDose && flaschenfarbe !== baseline.flaschenfarbe) ||
    glasTyp !== baseline.glasTyp ||
    Boolean(etikettDataUrl);

  const acceptFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setUploadError("");
    setUploading(true);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Bitte ein Bild auswählen (PNG, JPG, WEBP).");
      }
      if (file.size > 12 * 1024 * 1024) {
        throw new Error("Datei zu groß — bitte unter 12 MB.");
      }
      // Produktfoto ist die Etikett-Referenz: 2048 px, damit Kleingedrucktes lesbar bleibt.
      const dataUrl = await readAndCompressImage(file, 2048);
      setEtikettDataUrl(dataUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Bitte gib deiner Sorte einen Namen.");
      document.getElementById(nameInputId)?.focus();
      return;
    }
    setLocalError("");
    setConfirmDelete(false);
    setPhase("saving");
    try {
      await onSave({
        name: trimmed.slice(0, 80),
        produktKategorie,
        bierstil: isBier ? bierstil : produktKategorie,
        flaschenTyp,
        flaschenfarbe,
        glasTyp,
        filtrierung: isBier ? filtrierung : "filtriert",
        etikettDataUrl,
      });
      setPhase("success");
      window.setTimeout(() => onCancel(), reducedMotion ? 40 : 650);
    } catch (err) {
      setPhase("idle");
      setLocalError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  };

  const handleDelete = async () => {
    if (!onDelete || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    setLocalError("");
    setDeleting(true);
    try {
      await onDelete();
      onCancel();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      setDeleting(false);
    }
  };

  const reveal = (delayMs: number) =>
    reducedMotion
      ? { initial: false as const, animate: { opacity: 1 }, transition: INSTANT }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.32, delay: delayMs / 1000, ease: EASE },
        };

  const collapse = reducedMotion
    ? { initial: false as const, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: INSTANT }
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: "auto" },
        exit: { opacity: 0, height: 0 },
        transition: { duration: 0.26, ease: EASE },
      };

  const pill = (group: string) => `${uid}-pill-${group}`;

  const selectKategorie = (id: ProduktKategorie) => {
    setProduktKategorie(id);
    setBierstil(id === "bier" ? "helles" : id);
    setFlaschenTyp((current) => flascheForKategorie(id, current));
    setFlaschenfarbe(id === "bier" ? "braun" : "klar");
    if (id === "bier") {
      setGlasTyp(findBeerStyle("helles")?.glasTyp ?? "willibecher");
      setFiltrierung(defaultFiltrierung("helles"));
    }
  };

  const title = name.trim();
  const preview = <PromptPreview tokens={tokens} swatch={previewSwatch} reducedMotion={reducedMotion} />;

  return (
    <motion.div
      className={`studio-beer-create${manualOnly ? " studio-beer-create--manual" : ""}`}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.985, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.99, y: -4 }}
      transition={{ duration: reducedMotion ? 0.08 : 0.34, ease: EASE }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void handleSave();
        }
      }}
    >
      <motion.header className="studio-beer-create-header" {...reveal(0)}>
        <div className="studio-beer-create-header-copy">
          <span className="studio-beer-create-eyebrow">
            <span className="studio-beer-create-eyebrow-dot" aria-hidden="true" />
            {isEdit ? "Sortiment · Sorte bearbeiten" : "Sortiment · Neue Sorte"}
          </span>
          <h3 className={`studio-beer-create-title${title ? "" : " is-placeholder"}`}>
            {title || (isEdit ? "Unbenannte Sorte" : "Neue Sorte anlegen")}
          </h3>
          <p className="studio-beer-create-lead">
            {isEdit
              ? "Passe Name, Getränkeart oder Gebinde an — BrewAI übernimmt die Änderungen bei der Motiverstellung."
              : "Hinterlege die wichtigsten Merkmale deiner Sorte. BrewAI verwendet sie später automatisch bei der Motiverstellung."}
          </p>
        </div>
        {!isEdit ? (
          <button
            type="button"
            className="studio-beer-create-manual-btn"
            onClick={() => setManualOnly((v) => !v)}
            disabled={busy}
          >
            {manualOnly ? "Mit Foto" : "Ohne Foto"}
          </button>
        ) : null}
      </motion.header>

      <div className="studio-beer-create-body">
        <AnimatePresence initial={false} mode="popLayout">
          {!manualOnly ? (
            <motion.aside
              key="media-col"
              className="studio-beer-create-media"
              initial={reducedMotion ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: reducedMotion ? 0 : 0.3, delay: reducedMotion ? 0 : 0.06, ease: EASE }}
            >
              <div
                className={`studio-beer-create-drop${dragOver ? " is-drag" : ""}${previewImage ? " has-preview" : ""}${uploading ? " is-uploading" : ""}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void acceptFile(e.dataTransfer.files?.[0]);
                }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {previewImage ? (
                    <motion.div
                      key={previewImage}
                      className="studio-beer-create-drop-preview"
                      initial={reducedMotion ? false : { opacity: 0, scale: 1.06, filter: "blur(8px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
                      transition={{ duration: reducedMotion ? 0 : 0.45, ease: EASE }}
                    >
                      <img src={previewImage} alt="Flaschenfoto Vorschau" />
                      <span className="studio-beer-create-drop-shade" aria-hidden="true" />
                      <span className="studio-beer-create-drop-badge">
                        {etikettDataUrl ? "Neues Foto" : "Etikett"}
                      </span>
                      <button
                        type="button"
                        className="studio-beer-create-drop-change"
                        onClick={() => fileRef.current?.click()}
                        disabled={busy || uploading}
                      >
                        <ReplaceIcon />
                        Bild ersetzen
                      </button>
                    </motion.div>
                  ) : (
                    <motion.label
                      key="empty"
                      htmlFor={fileInputId}
                      className="studio-beer-create-drop-empty"
                      initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
                      transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE }}
                    >
                      <span className="studio-beer-create-bottle-wrap">
                        <BottleIcon className="studio-beer-create-bottle" />
                      </span>
                      <span className="studio-beer-create-drop-title">
                        {dragOver ? "Loslassen zum Hochladen" : "Flaschenfoto hierher ziehen"}
                      </span>
                      <span className="studio-beer-create-drop-hint">Ein Bild reicht. Etikett sollte lesbar sein.</span>
                      <span className="studio-beer-create-file-btn">Datei wählen</span>
                    </motion.label>
                  )}
                </AnimatePresence>
                {uploading ? <span className="studio-beer-create-drop-scan" aria-hidden="true" /> : null}
                <input
                  ref={fileRef}
                  id={fileInputId}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="studio-beer-create-file-input"
                  disabled={busy}
                  onChange={(e) => {
                    void acceptFile(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
              {preview}
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <LayoutGroup id={uid}>
          <div className="studio-beer-create-form">
            <Section index="01" title="Produkt" motionProps={reveal(60)}>
              <div className="studio-beer-create-field">
                <label className="studio-beer-create-label" htmlFor={nameInputId}>
                  Name der Sorte
                </label>
                <div className="studio-beer-create-input-wrap">
                  <input
                    id={nameInputId}
                    className="studio-beer-create-input"
                    value={name}
                    maxLength={80}
                    placeholder="z. B. Falter Hell"
                    disabled={busy}
                    aria-invalid={Boolean(localError && !name.trim())}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (localError) setLocalError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) e.preventDefault();
                    }}
                  />
                  <span className="studio-beer-create-input-count" aria-hidden="true">
                    {name.length}/80
                  </span>
                </div>
              </div>

              <div className="studio-beer-create-field">
                <span className="studio-beer-create-label">Getränkeart</span>
                <div className="studio-beer-create-segmented" role="group" aria-label="Getränkeart">
                  {GETRANKEART_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      on={produktKategorie === opt.id}
                      pillId={pill("kategorie")}
                      disabled={busy}
                      reducedMotion={reducedMotion}
                      onClick={() => selectKategorie(opt.id)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isBier ? (
                  <motion.div key="bier-fields" className="studio-beer-create-collapse" {...collapse}>
                    <div className="studio-beer-create-field">
                      <span className="studio-beer-create-label">Bierstil</span>
                      <div className="studio-beer-create-chips" role="group" aria-label="Bierstil">
                        {BEER_STYLE_OPTIONS.map((opt) => (
                          <Chip
                            key={opt.bierstil}
                            on={bierstil === opt.bierstil}
                            pillId={pill("stil")}
                            disabled={busy}
                            reducedMotion={reducedMotion}
                            onClick={() => {
                              setBierstil(opt.bierstil);
                              if (opt.glasTyp) setGlasTyp(opt.glasTyp);
                              setFiltrierung(defaultFiltrierung(opt.bierstil));
                            }}
                          >
                            {opt.label}
                          </Chip>
                        ))}
                      </div>
                    </div>

                    <div className="studio-beer-create-field">
                      <span className="studio-beer-create-label">Filtrierung</span>
                      <div
                        className="studio-beer-create-segmented studio-beer-create-segmented--half"
                        role="group"
                        aria-label="Filtrierung"
                      >
                        {FILTRIERUNG_CHOICES.map((opt) => (
                          <Chip
                            key={opt.code}
                            on={filtrierung === opt.code}
                            pillId={pill("filter")}
                            disabled={busy}
                            reducedMotion={reducedMotion}
                            onClick={() => setFiltrierung(opt.code)}
                          >
                            <span
                              className={`studio-beer-create-liquid${opt.code === "unfiltriert" ? " is-cloudy" : ""}`}
                              aria-hidden="true"
                            />
                            {opt.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Section>

            <Section index="02" title="Gebinde" motionProps={reveal(120)}>
              <div className="studio-beer-create-field">
                <span className="studio-beer-create-label">Flaschentyp</span>
                <div className="studio-beer-create-vessels" role="group" aria-label="Flaschentyp">
                  {flaschenGroups.map((group) => (
                    <div key={group.volume} className="studio-beer-create-vessel-row">
                      <span className="studio-beer-create-vessel-volume">{group.volume}</span>
                      <div className="studio-beer-create-chips">
                        {group.items.map((opt) => (
                          <Chip
                            key={opt.code}
                            on={flaschenTyp === opt.code}
                            pillId={pill("flasche")}
                            disabled={busy}
                            reducedMotion={reducedMotion}
                            onClick={() => {
                              setFlaschenTyp(opt.code);
                              if (opt.code === "brunnen_750") setFlaschenfarbe("gruen");
                              else if (flaschenTyp === "brunnen_750") setFlaschenfarbe("klar");
                            }}
                          >
                            {opt.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="studio-beer-create-field">
                <span className="studio-beer-create-label">Flaschenfarbe</span>
                <div
                  className={`studio-beer-create-chips${showDose ? " is-muted" : ""}`}
                  role="group"
                  aria-label="Flaschenfarbe"
                >
                  {FARBE_CHOICES.map((opt) => (
                    <Chip
                      key={opt.code}
                      on={!showDose && flaschenfarbe === opt.code}
                      pillId={pill("farbe")}
                      disabled={busy || showDose}
                      reducedMotion={reducedMotion}
                      className="studio-beer-create-chip--swatch"
                      onClick={() => setFlaschenfarbe(opt.code)}
                    >
                      <span
                        className="studio-beer-create-swatch"
                        style={{ background: opt.swatch }}
                        aria-hidden="true"
                      />
                      {opt.label}
                    </Chip>
                  ))}
                </div>
                <AnimatePresence initial={false}>
                  {showDose ? (
                    <motion.p key="dose-note" className="studio-beer-create-note" {...collapse}>
                      Bei Dosen entfällt die Flaschenfarbe.
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </Section>

            <Section index="03" title="Glas" motionProps={reveal(180)}>
              <div className="studio-beer-create-field">
                <span className="studio-beer-create-label">Glastyp</span>
                <div className="studio-beer-create-chips" role="group" aria-label="Glastyp">
                  {GLAS_CHOICES.map((opt) => (
                    <Chip
                      key={opt.code}
                      on={glasTyp === opt.code}
                      pillId={pill("glas")}
                      disabled={busy}
                      reducedMotion={reducedMotion}
                      onClick={() => setGlasTyp(opt.code)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </Section>

            {manualOnly ? preview : null}
          </div>
        </LayoutGroup>
      </div>

      <motion.footer className="studio-beer-create-footer" {...reveal(220)}>
        <AnimatePresence>
          {displayError ? (
            <motion.p
              className="studio-beer-create-error"
              role="alert"
              {...collapse}
            >
              {displayError}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="studio-beer-create-actions">
          <div className="studio-beer-create-actions-start">
            {isEdit && onDelete ? (
              <button
                type="button"
                className={`studio-beer-create-delete${confirmDelete ? " is-confirm" : ""}`}
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                <TrashIcon />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={deleting ? "deleting" : confirmDelete ? "confirm" : "idle"}
                    initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: reducedMotion ? 0 : 0.16, ease: EASE }}
                  >
                    {deleting ? "Wird gelöscht …" : confirmDelete ? "Wirklich löschen?" : "Sorte löschen"}
                  </motion.span>
                </AnimatePresence>
              </button>
            ) : null}
            <span className={`studio-beer-create-status${isEdit && dirty ? " is-dirty" : ""}`}>
              {isEdit ? (
                <>
                  <span className="studio-beer-create-status-dot" aria-hidden="true" />
                  {dirty ? "Ungespeicherte Änderungen" : "Keine Änderungen"}
                </>
              ) : (
                "Danach immer vorausgefüllt"
              )}
            </span>
          </div>

          <div className="studio-beer-create-actions-end">
            <button type="button" className="studio-beer-create-cancel" disabled={busy} onClick={onCancel}>
              Abbrechen
            </button>
            <motion.button
              type="button"
              layout={!reducedMotion}
              className={`studio-beer-create-save${phase === "success" ? " is-success" : ""}`}
              disabled={busy}
              onClick={() => void handleSave()}
              transition={{ layout: { duration: 0.22, ease: EASE } }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={phase}
                  className="studio-beer-create-save-inner"
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
                  transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE }}
                >
                  {phase === "saving" ? (
                    <>
                      <span className="studio-beer-create-spinner" aria-hidden="true" />
                      Wird gespeichert …
                    </>
                  ) : phase === "success" ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <motion.path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={reducedMotion ? false : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: reducedMotion ? 0 : 0.34, delay: 0.05, ease: EASE }}
                        />
                      </svg>
                      Gespeichert
                    </>
                  ) : (
                    <>
                      {isEdit ? "Änderungen speichern" : "Sorte übernehmen"}
                      <kbd className="studio-beer-create-kbd" aria-hidden="true">
                        {saveShortcut}
                      </kbd>
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.footer>
    </motion.div>
  );
}

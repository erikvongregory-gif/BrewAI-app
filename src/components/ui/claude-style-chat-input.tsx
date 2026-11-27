"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Plus, ChevronDown, ChevronLeft, ArrowUp, X, FileText, Loader2, Check, Archive, Search, Beer, CupSoda, Droplets, GlassWater } from "lucide-react";
import { cn } from "@/lib/utils";
import { BeerCreatePanel, type BeerCreateDraft } from "@/components/studio/beers/beer-create-panel";
import {
  GETRANKEART_OPTIONS,
  produktKategorieLabel,
  sanitizeProduktKategorie,
  type ProduktKategorie,
} from "@/lib/dashboard/metadata";

export const Icons = {
  Plus,
  SelectArrow: ChevronDown,
  ArrowUp,
  X,
  FileText,
  Loader2,
  Check,
  Archive,
};

export type ClaudeMenuOption = {
  id: string;
  name: string;
  description: string;
  badge?: string;
  preview?: string | null;
};

export type ClaudeAttachPreview = {
  id: string;
  name: string;
  preview: string | null;
  kind: "image" | "file";
  label?: string;
  removable: boolean;
  uploading?: boolean;
  onLabelClick?: () => void;
};

export type SortenPickerItem = {
  id: string;
  name: string;
  preview: string | null;
  description: string;
  kategorie: ProduktKategorie;
};

type SortenCategoryId = ProduktKategorie | "all";

const SORTEN_NAV: Array<{ group: string; items: Array<{ id: SortenCategoryId; label: string; Icon: typeof Beer }> }> = [
  {
    group: "Übersicht",
    items: [{ id: "all", label: "Alle", Icon: Archive }],
  },
  {
    group: "Getränke",
    items: [
      { id: "bier", label: "Bier", Icon: Beer },
      { id: "limonade", label: "Limo", Icon: CupSoda },
    ],
  },
  {
    group: "Wasser",
    items: [
      { id: "tafelwasser", label: "Tafelwasser", Icon: GlassWater },
      { id: "mineralwasser", label: "Mineralwasser", Icon: Droplets },
    ],
  },
];

function extraSortenNav() {
  const mapped = new Set(
    SORTEN_NAV.flatMap((group) => group.items.map((item) => item.id)).filter((id) => id !== "all"),
  );
  const extras = GETRANKEART_OPTIONS.filter((option) => !mapped.has(option.id));
  if (!extras.length) return [];
  return [
    {
      group: "Weitere",
      items: extras.map((option) => ({ id: option.id as SortenCategoryId, label: option.label, Icon: Droplets })),
    },
  ];
}

function SortenPopup({
  open,
  onOpenChange,
  items,
  selectedId,
  selectedCategoryId,
  brandName,
  brandPreview,
  onSelect,
  onSaveProduct,
  createError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SortenPickerItem[];
  selectedId: string;
  selectedCategoryId: string;
  brandName: string;
  brandPreview: string | null;
  brandDescription: string;
  onSelect: (id: string) => void;
  onSaveProduct?: (draft: BeerCreateDraft) => Promise<void>;
  createError?: string;
}) {
  const nav = [...SORTEN_NAV, ...extraSortenNav()];
  const [categoryId, setCategoryId] = useState<SortenCategoryId>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      const preferred = sanitizeProduktKategorie(selectedCategoryId);
      const hasPreferred = items.some((item) => item.kategorie === preferred);
      setCategoryId(hasPreferred ? preferred : "all");
      setQuery("");
      setCreating(false);
    }
  }, [open, selectedCategoryId, items]);

  const activeLabel =
    nav.flatMap((group) => group.items).find((item) => item.id === categoryId)?.label ??
    produktKategorieLabel(sanitizeProduktKategorie(categoryId === "all" ? selectedCategoryId : categoryId));
  const needle = query.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (categoryId !== "all" && item.kategorie !== categoryId) return false;
    if (!needle) return true;
    return item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle);
  });
  const showBrand = !needle || brandName.toLowerCase().includes(needle);
  const createCategory = categoryId === "all" ? sanitizeProduktKategorie(selectedCategoryId) : categoryId;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cc-portal cc-sorten-overlay" />
        <DialogPrimitive.Content
          aria-labelledby="sorten-popup-title"
          className={cn("cc-portal cc-sorten-dialog", creating ? "cc-sorten-dialog--create" : "cc-sorten-dialog--pick")}
          onEscapeKeyDown={(event) => {
            if (!creating) return;
            event.preventDefault();
            setCreating(false);
          }}
          onOpenAutoFocus={(event) => {
            const search = (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>('input[type="search"]');
            if (search) {
              event.preventDefault();
              search.focus();
            }
          }}
        >
        <DialogPrimitive.Description className="sr-only">
          Sorte auswählen oder neu anlegen
        </DialogPrimitive.Description>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-5">
          {creating ? (
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="inline-flex items-center gap-1 text-[14px] text-cc-text-300 hover:text-cc-text-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Zurück
            </button>
          ) : null}
          <DialogPrimitive.Title id="sorten-popup-title" className="text-[18px] font-semibold tracking-tight">
            {creating ? "Neue Sorte" : "Sorten"}
          </DialogPrimitive.Title>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cc-text-400 hover:bg-cc-bg-200 hover:text-cc-text-100"
            aria-label="Schließen"
          >
            <Icons.X className="h-4 w-4" />
          </button>
        </div>

        {creating && onSaveProduct ? (
          <div className="evg-studio min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 [&_.studio-beer-create-header-copy]:hidden">
            <BeerCreatePanel
              key={createCategory}
              error={createError}
              initialKategorie={createCategory}
              onSave={onSaveProduct}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-[168px] shrink-0 flex-col border-r border-cc-bg-300 px-2 pb-3 sm:flex">
              <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
                {nav.map((group) => (
                  <div key={group.group}>
                    <p className="px-2.5 pb-1.5 text-[12px] text-cc-text-400">{group.group}</p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = categoryId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setCategoryId(item.id)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px]",
                              active ? "bg-cc-bg-200 text-cc-text-100" : "text-cc-text-300 hover:bg-cc-bg-200 hover:text-cc-text-200",
                            )}
                          >
                            <item.Icon className="h-4 w-4 shrink-0 opacity-80" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-4 sm:px-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-medium text-cc-text-100">{activeLabel}</h3>
                <label className="relative w-[min(100%,180px)]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cc-text-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Suchen"
                    className="h-8 w-full rounded-full border border-cc-bg-300 bg-cc-bg-200 pl-8 pr-3 text-[13px] text-cc-text-100 outline-none placeholder:text-cc-text-400"
                  />
                </label>
              </div>

              <div className="mb-3 flex gap-2 overflow-x-auto sm:hidden">
                {nav.flatMap((group) => group.items).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategoryId(item.id)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-sm",
                      categoryId === item.id ? "bg-cc-bg-200 text-cc-text-100" : "text-cc-text-400",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {showBrand || visible.length || onSaveProduct ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    {showBrand ? (
                      <SortenCard
                        name={brandName}
                        preview={brandPreview}
                        selected={selectedId === ""}
                        onClick={() => {
                          onSelect("");
                          onOpenChange(false);
                        }}
                      />
                    ) : null}
                    {visible.map((item) => (
                      <SortenCard
                        key={item.id}
                        name={item.name}
                        preview={item.preview}
                        selected={selectedId === item.id}
                        onClick={() => {
                          onSelect(item.id);
                          onOpenChange(false);
                        }}
                      />
                    ))}
                    {onSaveProduct && !query.trim() ? (
                      <button type="button" onClick={() => setCreating(true)} className="group text-left">
                        <div className="flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed border-cc-bg-300 bg-cc-bg-200 text-cc-text-400 group-hover:border-cc-text-400 group-hover:text-cc-text-300">
                          <Plus className="h-6 w-6" />
                        </div>
                        <div className="mt-2 truncate px-0.5 text-[13px] font-medium text-cc-text-400">Neue Sorte</div>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="py-12 text-center text-[13px] text-cc-text-400">
                    {query.trim() ? "Keine Sorte gefunden." : `Noch keine ${activeLabel}-Sorte angelegt.`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SortenCard({
  name,
  preview,
  selected,
  onClick,
}: {
  name: string;
  preview: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group text-left">
      <div
        className={cn(
          "aspect-[4/5] overflow-hidden rounded-xl bg-cc-bg-200 outline outline-[2.5px] -outline-offset-[2.5px]",
          selected ? "outline-cc-accent" : "outline-transparent group-hover:outline-cc-bg-300",
        )}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-cc-text-400">Ohne Foto</div>
        )}
      </div>
      <div className="mt-2.5 truncate px-0.5 text-[14px] font-medium text-cc-text-100">{name}</div>
    </button>
  );
}

type MenuSelectProps = {
  options: ClaudeMenuOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  footerLabel?: string;
  onFooter?: () => void;
  align?: "left" | "right";
  emptyLabel?: string;
};

function MenuSelect({
  options,
  selectedId,
  onSelect,
  footerLabel,
  onFooter,
  align = "right",
  emptyLabel,
}: MenuSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = options.find((item) => item.id === selectedId) || options[0];
  const triggerClass = cn(
    "cc-menu-trigger inline-flex items-center justify-center relative shrink-0 font-normal h-8 rounded-xl min-w-[4rem] active:scale-[0.98] whitespace-nowrap text-xs pl-2.5 pr-2 gap-1",
    isOpen
      ? "bg-cc-bg-200 text-cc-text-100 dark:bg-[#454540] dark:text-[#ECECEC]"
      : "text-cc-text-300 hover:text-cc-text-200 hover:bg-cc-bg-200 dark:text-[#B4B4B4] dark:hover:text-[#ECECEC] dark:hover:bg-[#454540]",
  );

  if (!current) {
    return (
      <button type="button" onClick={onFooter} className={cn(triggerClass, "px-3")}>
        {emptyLabel || footerLabel || "Auswählen"}
      </button>
    );
  }

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <PopoverPrimitive.Trigger className={triggerClass} aria-haspopup="listbox">
        <div className="inline-flex gap-[3px] text-[14px] h-[14px] leading-none items-center">
          {current.preview ? (
            <img src={current.preview} alt="" className="h-4 w-4 rounded-full object-cover" />
          ) : null}
          <div className="whitespace-nowrap select-none font-medium">{current.name}</div>
        </div>
        <div className="flex items-center justify-center opacity-75" style={{ width: 20, height: 20 }}>
          <Icons.SelectArrow className={cn("shrink-0 opacity-75 cc-menu-arrow", isOpen && "rotate-180")} />
        </div>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align={align === "left" ? "start" : "end"}
          sideOffset={8}
          collisionPadding={12}
          role="listbox"
          className="cc-portal cc-menu-popover z-50 w-[260px] rounded-xl shadow-2xl overflow-hidden flex flex-col p-1.5"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
            if (!items.length) return;
            const index = items.findIndex((item) => item === document.activeElement);
            const next =
              event.key === "ArrowDown"
                ? (index + 1) % items.length
                : (index - 1 + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={selectedId === option.id}
              onClick={() => {
                onSelect(option.id);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl flex items-start justify-between group hover:bg-cc-bg-200"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {option.preview ? (
                  <img src={option.preview} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover" />
                ) : null}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-cc-text-100 dark:text-[#ECECEC]">{option.name}</span>
                    {option.badge ? (
                      <span className="px-1.5 py-[1px] rounded-full text-[10px] font-medium border border-cc-bg-300 text-cc-text-300">
                        {option.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-cc-text-300 dark:text-[#999999]">{option.description}</span>
                </div>
              </div>
              {selectedId === option.id ? (
                <Icons.Check className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 shrink-0" />
              ) : null}
            </button>
          ))}
          {footerLabel && onFooter ? (
            <>
              <div className="h-px bg-cc-bg-300 my-1 mx-2" />
              <button
                type="button"
                onClick={() => {
                  onFooter();
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between group hover:bg-cc-bg-200 text-cc-text-100"
              >
                <span className="text-[13px] font-semibold">{footerLabel}</span>
                <Icons.SelectArrow className="w-4 h-4 -rotate-90 text-cc-text-300 dark:text-[#999999]" />
              </button>
            </>
          ) : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function AttachCard({
  item,
  onRemove,
}: {
  item: ClaudeAttachPreview;
  onRemove: (id: string) => void;
}) {
  const isImage = item.kind === "image" && item.preview;

  return (
    <div className="relative group flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-cc-bg-300 bg-cc-bg-200 cc-fade-in hover:border-cc-text-400">
      {isImage ? (
        <div className="w-full h-full relative">
          <img src={item.preview!} alt={item.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
        </div>
      ) : (
        <div className="w-full h-full p-3 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cc-bg-300 rounded-sm">
              <Icons.FileText className="w-4 h-4 text-cc-text-300" />
            </div>
          </div>
          <p className="text-xs font-medium text-cc-text-200 truncate" title={item.name}>
            {item.name}
          </p>
        </div>
      )}

      {item.label ? (
        <button
          type="button"
          onClick={item.onLabelClick}
          disabled={!item.onLabelClick}
          className="absolute bottom-1 left-1 px-1.5 py-[2px] rounded-sm border border-[#E5E5E5] bg-white/95 text-[9px] font-bold text-[#6B7280] uppercase tracking-wider"
        >
          {item.label}
        </button>
      ) : null}

      {item.removable ? (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Entfernen"
        >
          <Icons.X className="w-3 h-3" />
        </button>
      ) : null}

      {item.uploading ? (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Icons.Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
      ) : null}
    </div>
  );
}

export type ClaudeChatInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  canSend?: boolean;
  sendTitle?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  attachments?: ClaudeAttachPreview[];
  onRemoveAttachment?: (id: string) => void;
  onFiles?: (files: FileList | File[]) => void;
  canAttach?: boolean;
  accept?: string;
  children?: React.ReactNode;
  sorten: SortenPickerItem[];
  selectedProductId: string;
  selectedProductLabel?: string;
  selectedProductPreview?: string | null;
  onSelectProduct: (id: string) => void;
  onSaveProduct?: (draft: BeerCreateDraft) => Promise<void>;
  createError?: string;
  brandName: string;
  brandPreview: string | null;
  brandDescription: string;
  selectedCategoryId: string;
  characterOptions: ClaudeMenuOption[];
  selectedCharacterId: string;
  onSelectCharacter: (id: string) => void;
  modeOptions: ClaudeMenuOption[];
  selectedModeId: string;
  onSelectMode: (id: string) => void;
  aspectOptions?: string[];
  selectedAspect?: string;
  onSelectAspect?: (id: string) => void;
  isAspectDisabled?: (id: string) => boolean;
  variantOptions?: number[];
  selectedVariantCount?: number;
  onSelectVariantCount?: (count: number) => void;
  presetLabel?: string;
  onOpenPreset?: () => void;
};

export function ClaudeChatInput({
  value,
  onValueChange,
  onSend,
  placeholder = "Beschreibe das Motiv …",
  disabled = false,
  sending = false,
  canSend = false,
  sendTitle,
  textareaRef,
  attachments = [],
  onRemoveAttachment,
  onFiles,
  canAttach = true,
  accept = "image/png,image/jpeg,image/webp",
  children,
  sorten,
  selectedProductId,
  selectedProductLabel,
  selectedProductPreview,
  onSelectProduct,
  onSaveProduct,
  createError,
  brandName,
  brandPreview,
  brandDescription,
  selectedCategoryId,
  characterOptions,
  selectedCharacterId,
  onSelectCharacter,
  modeOptions,
  selectedModeId,
  onSelectMode,
  aspectOptions = [],
  selectedAspect,
  onSelectAspect,
  isAspectDisabled,
  variantOptions = [],
  selectedVariantCount,
  onSelectVariantCount,
  presetLabel,
  onOpenPreset,
}: ClaudeChatInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [sortenOpen, setSortenOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedRef = textareaRef ?? innerRef;
  const productTriggerLabel = selectedProductLabel?.trim() || "Sorte";

  useEffect(() => {
    const node = resolvedRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 384)}px`;
  }, [value, resolvedRef]);

  const handleFiles = (list: FileList | File[] | null) => {
    if (!list || !canAttach || disabled || !onFiles) return;
    onFiles(list);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canAttach || !onFiles) return;
    const files: File[] = [];
    for (const item of Array.from(event.clipboardData.items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file?.type.startsWith("image/")) files.push(file);
      }
    }
    if (files.length) {
      event.preventDefault();
      onFiles(files);
    }
  };

  const handleSend = () => {
    if (disabled || sending || !canSend) return;
    onSend();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="relative w-full max-w-2xl mx-auto font-sans"
      onDragOver={
        canAttach
          ? (event) => {
              event.preventDefault();
              setIsDragging(true);
            }
          : undefined
      }
      onDragLeave={
        canAttach
          ? (event) => {
              event.preventDefault();
              setIsDragging(false);
            }
          : undefined
      }
      onDrop={
        canAttach
          ? (event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }
          : undefined
      }
    >
      <div className={cn(
        "!box-content flex flex-col mx-2 md:mx-0 items-stretch relative z-10 rounded-xl cursor-text border border-cc-bg-300 dark:border-transparent shadow-[0_0_15px_rgba(0,0,0,0.08)] hover:shadow-[0_0_20px_rgba(0,0,0,0.12)] focus-within:shadow-[0_0_25px_rgba(0,0,0,0.15)] bg-white dark:bg-[#30302E] font-sans antialiased cc-prompt-shell",
        isDragging && "ring-2 ring-cc-accent/40",
      )}>
        <div className="flex flex-col px-3 pt-3 pb-2 gap-2">
          {attachments.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto cc-scroll pb-2 px-1">
              {attachments.map((item) => (
                <AttachCard key={item.id} item={item} onRemove={(id) => onRemoveAttachment?.(id)} />
              ))}
            </div>
          ) : null}

          {children}

          <div className="relative mb-1">
            <div className="max-h-96 w-full overflow-y-auto cc-scroll font-sans break-words transition-opacity duration-200 min-h-[2.5rem] pl-1">
              <textarea
                ref={resolvedRef}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full bg-transparent border-0 outline-none text-cc-text-100 text-[16px] placeholder:text-cc-text-400 resize-none overflow-hidden py-0 leading-relaxed block font-normal antialiased"
                rows={1}
                maxLength={800}
                style={{ minHeight: "1.5em" }}
              />
            </div>
          </div>

          <div className="flex gap-2 w-full items-center">
            <div className="relative flex-1 flex items-center shrink min-w-0 gap-1 overflow-x-auto cc-scroll">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canAttach || disabled}
                className="inline-flex items-center justify-center relative shrink-0 transition-colors duration-200 h-8 w-8 rounded-lg active:scale-95 text-cc-text-400 hover:text-cc-text-200 hover:bg-cc-bg-200 disabled:opacity-40"
                aria-label="Referenzbild hinzufügen"
              >
                <Icons.Plus className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => setSortenOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sortenOpen}
                className={cn(
                  "cc-menu-trigger inline-flex items-center justify-center relative shrink-0 font-normal h-8 rounded-xl min-w-[4rem] active:scale-[0.98] whitespace-nowrap text-xs pl-2 pr-2 gap-1.5",
                  sortenOpen
                    ? "bg-cc-bg-200 text-cc-text-100"
                    : "text-cc-text-300 hover:text-cc-text-200 hover:bg-cc-bg-200",
                )}
              >
                {selectedProductPreview ? (
                  <img src={selectedProductPreview} alt="" className="h-4 w-4 rounded-sm object-cover" />
                ) : null}
                <span className="select-none font-medium text-[14px] leading-none max-w-[7rem] truncate">{productTriggerLabel}</span>
                <Icons.SelectArrow className={cn("h-5 w-5 opacity-75 cc-menu-arrow", sortenOpen && "rotate-180")} />
              </button>

              <MenuSelect
                options={characterOptions}
                selectedId={selectedCharacterId}
                onSelect={onSelectCharacter}
                align="left"
                emptyLabel="Charakter"
              />

              {onOpenPreset ? (
                <button
                  type="button"
                  onClick={onOpenPreset}
                  disabled={disabled}
                  className="cc-menu-trigger inline-flex items-center justify-center relative shrink-0 font-normal h-8 rounded-xl min-w-[4rem] active:scale-[0.98] whitespace-nowrap text-xs pl-2.5 pr-2 gap-1 text-cc-text-300 hover:text-cc-text-200 hover:bg-cc-bg-200"
                >
                  <span className="select-none font-medium text-[14px] leading-none max-w-[8rem] truncate">
                    {presetLabel || "Vorlage"}
                  </span>
                  <Icons.SelectArrow className="h-5 w-5 opacity-75 cc-menu-arrow" />
                </button>
              ) : null}

              {aspectOptions.length && selectedAspect && onSelectAspect ? (
                <PopoverPrimitive.Root open={aspectOpen} onOpenChange={setAspectOpen}>
                  <PopoverPrimitive.Trigger
                    className={cn(
                      "cc-menu-trigger inline-flex items-center justify-center relative shrink-0 font-normal h-8 rounded-xl min-w-[4rem] active:scale-[0.98] whitespace-nowrap text-xs pl-2.5 pr-2 gap-1",
                      aspectOpen
                        ? "bg-cc-bg-200 text-cc-text-100"
                        : "text-cc-text-300 hover:text-cc-text-200 hover:bg-cc-bg-200",
                    )}
                    aria-label="Bildformat"
                  >
                    <span className="select-none font-medium text-[14px] leading-none">{selectedAspect}</span>
                    <Icons.SelectArrow className={cn("h-5 w-5 opacity-75 cc-menu-arrow", aspectOpen && "rotate-180")} />
                  </PopoverPrimitive.Trigger>
                  <PopoverPrimitive.Portal>
                    <PopoverPrimitive.Content
                      side="top"
                      align="start"
                      sideOffset={8}
                      collisionPadding={12}
                      className="cc-portal cc-menu-popover z-50 w-[180px] rounded-xl shadow-2xl overflow-hidden flex flex-col p-1.5"
                      role="listbox"
                      aria-label="Seitenverhältnis"
                    >
                      <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-cc-text-400">Format</p>
                      {aspectOptions.map((aspect) => {
                        const disabledAspect = Boolean(isAspectDisabled?.(aspect));
                        return (
                          <button
                            key={aspect}
                            type="button"
                            role="option"
                            aria-selected={selectedAspect === aspect}
                            disabled={disabledAspect}
                            onClick={() => {
                              onSelectAspect(aspect);
                              setAspectOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium",
                              selectedAspect === aspect ? "bg-cc-bg-200 text-cc-text-100" : "text-cc-text-300 hover:bg-cc-bg-200 hover:text-cc-text-200",
                              disabledAspect && "opacity-40 cursor-not-allowed",
                            )}
                          >
                            {aspect}
                          </button>
                        );
                      })}
                    </PopoverPrimitive.Content>
                  </PopoverPrimitive.Portal>
                </PopoverPrimitive.Root>
              ) : null}

              {variantOptions.length && selectedVariantCount && onSelectVariantCount ? (
                <PopoverPrimitive.Root open={variantOpen} onOpenChange={setVariantOpen}>
                  <PopoverPrimitive.Trigger
                    className={cn(
                      "cc-menu-trigger inline-flex items-center justify-center relative shrink-0 font-normal h-8 rounded-xl min-w-[3rem] active:scale-[0.98] whitespace-nowrap text-xs pl-2.5 pr-2 gap-1",
                      variantOpen
                        ? "bg-cc-bg-200 text-cc-text-100"
                        : "text-cc-text-300 hover:text-cc-text-200 hover:bg-cc-bg-200",
                    )}
                    aria-label="Variantenanzahl"
                  >
                    <span className="select-none font-medium text-[14px] leading-none">{selectedVariantCount}</span>
                    <Icons.SelectArrow className={cn("h-5 w-5 opacity-75 cc-menu-arrow", variantOpen && "rotate-180")} />
                  </PopoverPrimitive.Trigger>
                  <PopoverPrimitive.Portal>
                    <PopoverPrimitive.Content
                      side="top"
                      align="start"
                      sideOffset={8}
                      collisionPadding={12}
                      className="cc-portal cc-menu-popover z-50 w-[140px] rounded-xl shadow-2xl overflow-hidden flex flex-col p-1.5"
                      role="listbox"
                      aria-label="Varianten"
                    >
                      {variantOptions.map((count) => (
                        <button
                          key={count}
                          type="button"
                          role="option"
                          aria-selected={selectedVariantCount === count}
                          onClick={() => {
                            onSelectVariantCount(count);
                            setVariantOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium",
                            selectedVariantCount === count ? "bg-cc-bg-200 text-cc-text-100" : "text-cc-text-300 hover:bg-cc-bg-200 hover:text-cc-text-200",
                          )}
                        >
                          {count} {count === 1 ? "Variante" : "Varianten"}
                        </button>
                      ))}
                    </PopoverPrimitive.Content>
                  </PopoverPrimitive.Portal>
                </PopoverPrimitive.Root>
              ) : null}
            </div>

            <div className="flex flex-row items-center min-w-0 gap-1">
              <div className="shrink-0 p-1 -m-1">
                <MenuSelect
                  options={modeOptions}
                  selectedId={selectedModeId}
                  onSelect={onSelectMode}
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend || disabled || sending}
                  title={sendTitle}
                  className={cn(
                    "inline-flex items-center justify-center relative shrink-0 transition-colors rounded-xl h-8 w-8 active:scale-95",
                    (canSend && !disabled) || sending
                      ? "bg-cc-accent text-cc-bg-0 hover:bg-cc-accent-hover shadow-md"
                      : "bg-cc-accent/30 text-cc-bg-0/60 cursor-default",
                  )}
                  aria-label="Bild erstellen"
                  aria-busy={sending || undefined}
                >
                  {sending ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.ArrowUp className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SortenPopup
        open={sortenOpen}
        onOpenChange={setSortenOpen}
        items={sorten}
        selectedId={selectedProductId}
        selectedCategoryId={selectedCategoryId}
        brandName={brandName}
        brandPreview={brandPreview}
        brandDescription={brandDescription}
        onSelect={onSelectProduct}
        onSaveProduct={onSaveProduct}
        createError={createError}
      />

      {isDragging ? (
        <div className="absolute inset-0 bg-cc-bg-200/90 border-2 border-dashed border-cc-accent rounded-xl z-50 flex flex-col items-center justify-center pointer-events-none">
          <Icons.Archive className="w-10 h-10 text-cc-accent mb-2" />
          <p className="text-cc-accent font-medium">Bilder hier ablegen</p>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export default ClaudeChatInput;

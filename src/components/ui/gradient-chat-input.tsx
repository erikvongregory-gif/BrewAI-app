"use client";

import * as React from "react";
import { Plus, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ChatMessage {
  id: number;
  text: string;
  sender: "user" | "bot";
}

export interface GradientChatInputProps {
  /** Placeholder shown inside the text field. */
  placeholder?: string;
  /** Controlled value — when set, the field is controlled from outside. */
  value?: string;
  onChange?: (value: string) => void;
  /** Auto-reply pushed back after a user message. Pass `null` to disable. */
  autoReply?: string | null;
  /** Delay (ms) before the auto-reply lands. */
  autoReplyDelay?: number;
  /** Max number of bubbles kept on screen. */
  maxVisible?: number;
  /** Show floating demo bubbles above the input. */
  showBubbles?: boolean;
  /** Disable send while parent is busy. */
  disabled?: boolean;
  /** Play synthesized send / receive sounds. */
  sound?: boolean;
  /** The spectrum used for the reveal glow (top → bottom). */
  gradientColors?: string[];
  /** Fired whenever the user submits a message. */
  onSend?: (message: string) => void;
  /** Optional leading action (defaults to Plus). */
  onAddClick?: () => void;
  addAriaLabel?: string;
  className?: string;
}

const DEFAULT_GRADIENT = ["#C7691E", "#E89259", "#F9C83D", "#C2D6E1", "#144EC5"];

export default function GradientChatInput({
  placeholder = "Frag BrewAI zu allem …",
  value: valueProp,
  onChange,
  autoReply = null,
  autoReplyDelay = 650,
  maxVisible = 4,
  showBubbles = false,
  disabled = false,
  sound = false,
  gradientColors = DEFAULT_GRADIENT,
  onSend,
  onAddClick,
  addAriaLabel = "Anhang hinzufügen",
  className,
}: GradientChatInputProps) {
  const [uncontrolled, setUncontrolled] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const idRef = React.useRef(0);
  const timersRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = React.useRef<AudioContext | null>(null);

  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : uncontrolled;
  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const getAudioContext = React.useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    return audioRef.current;
  }, []);

  const playChime = React.useCallback(
    (notes: { freq: number; at: number }[], volume: number) => {
      if (!sound) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume();

      notes.forEach(({ freq, at }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + at;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    },
    [sound, getAudioContext],
  );

  const playSend = React.useCallback(
    () =>
      playChime(
        [
          { freq: 523.25, at: 0 },
          { freq: 783.99, at: 0.06 },
        ],
        0.05,
      ),
    [playChime],
  );

  const playReceive = React.useCallback(
    () =>
      playChime(
        [
          { freq: 392.0, at: 0 },
          { freq: 587.33, at: 0.08 },
        ],
        0.05,
      ),
    [playChime],
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      void audioRef.current?.close();
    };
  }, []);

  const pushMessage = (text: string, sender: ChatMessage["sender"]) =>
    setMessages((prev) => [...prev, { id: idRef.current++, text, sender }]);

  const handleSend = () => {
    const text = value.trim();
    if (!text || disabled) return;

    onSend?.(text);
    if (showBubbles) {
      pushMessage(text, "user");
      playSend();
    }
    setValue("");

    if (showBubbles && autoReply) {
      const t = setTimeout(() => {
        pushMessage(autoReply, "bot");
        playReceive();
        timersRef.current = timersRef.current.filter((timer) => timer !== t);
      }, autoReplyDelay);
      timersRef.current.push(t);
    }
  };

  const hasText = value.trim().length > 0;
  const visible = messages.slice(-maxVisible);
  const gradient = `linear-gradient(135deg, ${gradientColors.join(", ")})`;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[2px] rounded-xl opacity-70 blur-[10px] transition-opacity"
        style={{
          background: gradient,
          opacity: hasText || showBubbles ? 0.55 : 0.28,
        }}
      />

      <div className="relative rounded-xl border border-border bg-background p-1 shadow-[0_10px_20px_-6px_rgba(0,0,0,0.1)]">
        <div className="relative z-[2] flex items-center justify-between gap-2 rounded-xl bg-background p-1.5">
          <div className="flex flex-1 items-center gap-3 pr-1">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={addAriaLabel}
              className="size-10 shrink-0 rounded-xl"
              onClick={onAddClick}
              disabled={!onAddClick || disabled}
            >
              <Plus className="size-5" />
            </Button>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={focused ? undefined : placeholder}
              aria-label="Nachricht"
              disabled={disabled}
              maxLength={1200}
              autoComplete="off"
              className={cn(
                "h-auto min-w-0 flex-1 border-0 bg-transparent py-0 pl-1 pr-0 text-base shadow-none",
                "caret-acc",
                "focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-sm",
              )}
            />
          </div>
          <Button
            type="button"
            onClick={handleSend}
            onMouseDown={(e) => e.preventDefault()}
            variant={hasText ? "default" : "secondary"}
            size="icon"
            aria-label="Nachricht senden"
            disabled={!hasText || disabled}
            className="size-10 shrink-0 rounded-xl transition-colors active:scale-95"
          >
            <Send className="size-5" strokeWidth={2.25} />
          </Button>
        </div>

        {showBubbles ? (
          <div className="pointer-events-none absolute bottom-[70px] right-0 z-[1] flex w-full flex-col items-end gap-2">
            <AnimatePresence initial={false}>
              {visible.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 24, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className={cn(
                    "max-w-[260px] break-words px-3.5 py-2.5 text-sm shadow-[0_10px_20px_-6px_rgba(0,0,0,0.15)]",
                    m.sender === "user"
                      ? "self-end rounded-xl rounded-br-sm border border-border bg-background text-foreground"
                      : "self-start rounded-xl rounded-bl-sm bg-primary text-primary-foreground",
                  )}
                >
                  {m.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : null}
      </div>
    </div>
  );
}

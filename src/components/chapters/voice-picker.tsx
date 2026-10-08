"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Pause, Play, Search } from "lucide-react";
import { cn } from "cn";

import type { VoiceRef } from "@/lib/tts/types";

type PanelRect = { top?: number; bottom?: number; left: number; width: number };

export function VoicePicker({
  target,
  value,
  pool,
  disabled,
  previewing,
  previewLoading,
  onSelect,
  onPreview,
}: {
  target: string;
  value: string;
  pool: VoiceRef[];
  disabled?: boolean;
  previewing: string | null;
  previewLoading: string | null;
  onSelect: (voiceId: string) => void;
  onPreview: (key: string, voiceId: string, sample?: string | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      const node = event.target as Node;
      if (triggerRef.current?.contains(node) || panelRef.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function close() {
      setOpen(false);
    }
    function onScroll(event: Event) {
      // Scrolling the panel's own list must not close it; scrolling the page
      // (which moves the trigger) should.
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 320 && r.top > spaceBelow;
      setRect(
        openUp
          ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width }
          : { top: r.bottom + 4, left: r.left, width: r.width },
      );
    }
    setQuery("");
    setOpen(true);
  }

  const current = pool.find((voice) => voice.voiceId === value);
  const q = query.trim().toLowerCase();
  const list = q
    ? pool.filter(
        (voice) =>
          voice.name.toLowerCase().includes(q) ||
          (voice.description ?? "").toLowerCase().includes(q),
      )
    : pool;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent bg-secondary px-2 py-1.5 text-left text-xs text-foreground outline-none hover:bg-surface-card focus-visible:shadow-input disabled:opacity-50"
      >
        <span className="min-w-0 truncate">
          {current ? current.name : `${value.slice(0, 12)}…`}
          {current?.description ? (
            <span className="text-text-secondary"> — {current.description}</span>
          ) : null}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-text-secondary" />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                position: "fixed",
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                zIndex: 50,
              }}
              className="overflow-hidden rounded-md bg-surface-card shadow-dialog ring-1 ring-black/40"
            >
              <div className="relative border-b border-border p-1.5">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-text-secondary" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter voices"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="h-8 w-full rounded bg-secondary pr-2 pl-8 text-xs text-foreground outline-none placeholder:text-text-secondary"
                />
              </div>
              <ul className="max-h-64 overflow-y-auto py-1">
                {list.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-text-secondary">No voices match.</li>
                ) : (
                  list.map((voice) => {
                    const key = `${target}:${voice.voiceId}`;
                    const selected = voice.voiceId === value;
                    return (
                      <li key={voice.voiceId}>
                        <div
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/60",
                            selected && "bg-secondary/40",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelect(voice.voiceId);
                              setOpen(false);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="flex w-4 shrink-0 justify-center">
                              {selected ? <Check className="size-3.5 text-brand" /> : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs text-foreground">
                                {voice.name}
                              </span>
                              {voice.description ? (
                                <span className="block truncate text-[10px] text-text-secondary">
                                  {voice.description}
                                </span>
                              ) : null}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onPreview(key, voice.voiceId, voice.sample);
                            }}
                            aria-label={`Preview ${voice.name}`}
                            title={`Preview ${voice.name}`}
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-background"
                          >
                            {previewLoading === key ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : previewing === key ? (
                              <Pause className="size-3.5 fill-current" />
                            ) : (
                              <Play className="size-3.5 fill-current" />
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

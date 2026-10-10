"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [direction, setDirection] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setUrl("");
    setContext("");
    setDirection("");
    setDragging(false);
    setPending(false);
    setError(null);
  }, [open]);

  function pick(files: FileList | null) {
    const chosen = files?.[0];
    if (chosen) {
      setFile(chosen);
      setError(null);
    }
  }

  async function post(body: FormData) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/books", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | { book?: { id: string }; error?: string }
        | null;

      if (!response.ok || !payload?.book) {
        setError(payload?.error ?? "Import failed");
        setPending(false);
        return;
      }
      onClose();
      router.refresh();
      router.push(`/book/${payload.book.id}`);
    } catch {
      setError("Import failed");
      setPending(false);
    }
  }

  function withExtras(body: FormData): FormData {
    if (context.trim()) body.append("context", context.trim());
    if (direction.trim()) body.append("direction", direction.trim());
    return body;
  }

  function submitFile() {
    if (!file) {
      setError("Choose a file.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    void post(withExtras(body));
  }

  function narrateUrl() {
    const value = url.trim();
    if (!value) {
      setError("Paste a link.");
      return;
    }
    const body = new FormData();
    body.append("url", value);
    void post(withExtras(body));
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-lg bg-card p-5 shadow-dialog">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold tracking-tight">Import</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center transition-colors",
            dragging ? "border-brand bg-secondary" : "border-border hover:bg-secondary/50",
          )}
        >
          <UploadCloud className={cn("size-6", dragging ? "text-brand" : "text-text-secondary")} />
          <span className="text-sm">
            {file ? file.name : "Drop an EPUB, TXT, Markdown, or PDF file here, or click to browse"}
          </span>
          <span className="text-xs text-text-secondary">.epub · .txt · .md · .pdf</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,.txt,.md,.markdown,.pdf,application/epub+zip,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(event) => pick(event.target.files)}
        />

        <div className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="or paste an article link"
            aria-label="Article URL"
            className="h-9"
          />
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={narrateUrl}
            disabled={pending || !url.trim()}
          >
            Narrate
          </Button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wide text-text-secondary uppercase">
            Character reference (optional)
          </span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            rows={2}
            placeholder="Names, aliases, call signs — or a Wikipedia/Fandom link."
            className="w-full resize-y rounded-md border border-transparent bg-secondary px-3 py-2 text-sm outline-none placeholder:text-text-secondary focus-visible:shadow-input"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wide text-text-secondary uppercase">
            Story direction (optional)
          </span>
          <textarea
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            rows={2}
            placeholder="e.g. this is the 86—Eighty-Six novel; military sci-fi; characters go by call signs."
            className="w-full resize-y rounded-md border border-transparent bg-secondary px-3 py-2 text-sm outline-none placeholder:text-text-secondary focus-visible:shadow-input"
          />
        </label>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submitFile} disabled={pending || !file} className="gap-2">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? "Importing…" : "Import file"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

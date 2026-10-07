"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function UploadEpub() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPending(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/books", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | { book?: { id: string }; error?: string }
        | null;

      if (!response.ok || !payload?.book) {
        setError(payload?.error ?? "Import failed");
        setPending(false);
        return;
      }

      router.push(`/book/${payload.book.id}`);
      router.refresh();
    } catch {
      setError("Import failed");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={onSelect}
      />
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Importing…" : "Import EPUB"}
      </Button>
      {error ? (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

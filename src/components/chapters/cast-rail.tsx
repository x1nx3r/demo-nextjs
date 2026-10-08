"use client";

import { useRef, useState } from "react";

import { VoicePicker } from "@/components/chapters/voice-picker";
import type { Cast, VoiceRef } from "@/lib/tts/types";

const BADGE =
  "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tracking-wide text-text-secondary uppercase";

export function CastRail({
  cast,
  pool,
  loading,
  saving,
  onChange,
}: {
  cast: Cast | null;
  pool: VoiceRef[];
  loading?: boolean;
  saving?: string | null;
  onChange: (target: string, voiceId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPreviewing(null);
  }

  async function togglePreview(key: string, voiceId: string, sample?: string | null) {
    if (previewing === key) {
      stopPreview();
      return;
    }
    stopPreview();

    const audio = audioRef.current ?? (audioRef.current = new Audio());
    audio.onended = () => stopPreview();

    // A creator sample is instant and shows how the voice actually performs.
    if (sample) {
      setPreviewLoading(key);
      try {
        audio.src = sample;
        await audio.play();
        setPreviewing(key);
      } catch {
        stopPreview();
      } finally {
        setPreviewLoading(null);
      }
      return;
    }

    // Fall back to synthesizing a line with the active provider.
    setPreviewLoading(key);
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const url = URL.createObjectURL(await res.blob());
      urlRef.current = url;
      audio.src = url;
      await audio.play();
      setPreviewing(key);
    } catch {
      stopPreview();
    } finally {
      setPreviewLoading(null);
    }
  }

  const characters = cast?.characters ?? [];
  const pickerProps = { pool, previewing, previewLoading, onPreview: togglePreview };

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wide text-text-secondary uppercase">Cast</h2>
        {cast ? <span className="text-xs text-text-secondary">{characters.length}</span> : null}
      </div>

      {loading && !cast ? (
        <p className="text-xs text-text-secondary">Loading…</p>
      ) : characters.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No cast yet. Plan a chapter and the Director will build one.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          <li className="flex flex-col gap-2 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Narrator</span>
              {saving === "narrator" ? (
                <span className="text-[10px] text-text-secondary">saving…</span>
              ) : null}
            </div>
            {cast ? (
              <VoicePicker
                target="narrator"
                value={cast.narrator.voiceId}
                disabled={saving === "narrator"}
                onSelect={(voiceId) => {
                  stopPreview();
                  onChange("narrator", voiceId);
                }}
                {...pickerProps}
              />
            ) : null}
          </li>

          {characters.map((member) => (
            <li key={member.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{member.name}</span>
                {saving === member.id ? (
                  <span className="shrink-0 text-[10px] text-text-secondary">saving…</span>
                ) : null}
              </div>
              {member.aliases.length > 0 ? (
                <p className="truncate text-xs text-text-secondary">{member.aliases.join(" · ")}</p>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {member.gender ? <span className={BADGE}>{member.gender}</span> : null}
                {member.ageBand ? <span className={BADGE}>{member.ageBand}</span> : null}
                {member.importance ? <span className={BADGE}>{member.importance}</span> : null}
              </div>
              {member.register ? (
                <p className="text-xs text-text-secondary italic">{member.register}</p>
              ) : null}
              <VoicePicker
                target={member.id}
                value={member.voiceId}
                disabled={saving === member.id}
                onSelect={(voiceId) => {
                  stopPreview();
                  onChange(member.id, voiceId);
                }}
                {...pickerProps}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-text-secondary">
        Changing a voice clears the audio of units that used it. Re-render the chapter to hear it.
      </p>
    </section>
  );
}

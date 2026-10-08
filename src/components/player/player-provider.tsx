"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PAUSE_SECONDS } from "@/lib/ingest/types";
import type { NowPlayingData, PlayableUnit } from "@/lib/player/types";

/** Seconds to show "Up next" before rolling into the next chapter. */
const AUTO_NEXT_SECONDS = 4;

type LoadRef = { bookId: string; idx: number };

export type PlayerContextValue = {
  data: NowPlayingData | null;
  current: PlayableUnit | null;
  index: number;
  playing: boolean;
  speed: number;
  volume: number;
  currentTime: number;
  duration: number;
  needsGesture: boolean;
  upNext: number | null;
  loading: boolean;
  error: string | null;
  load: (ref: LoadRef, opts?: { autoplay?: boolean }) => Promise<void>;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  nextUnit: () => void;
  prevUnit: () => void;
  jumpTo: (index: number) => void;
  seek: (seconds: number) => void;
  setSpeed: (value: number) => void;
  setVolume: (value: number) => void;
  cancelUpNext: () => void;
  playNextChapter: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within a PlayerProvider");
  return context;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const loadToken = useRef(0);

  const [data, setData] = useState<NowPlayingData | null>(null);
  const [index, setIndex] = useState(0);
  // `playing` is user intent, not the element's paused state, so a source swap
  // between units cannot silently stop playback.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [upNext, setUpNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = data?.units[index] ?? null;
  const atLast = data ? index >= data.units.length - 1 : true;

  const attemptPlay = useCallback((audio: HTMLAudioElement) => {
    const promise = audio.play();
    if (!promise) return;
    promise
      .then(() => setNeedsGesture(false))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPlaying(false);
        setNeedsGesture(true);
      });
  }, []);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const load = useCallback(async (ref: LoadRef, opts?: { autoplay?: boolean }) => {
    const token = ++loadToken.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/chapters/${ref.bookId}/${ref.idx}/units`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Failed to load chapter (${response.status})`);
      const payload = (await response.json()) as NowPlayingData;
      if (token !== loadToken.current) return;
      setData(payload);
      setIndex(0);
      setCurrentTime(0);
      setDuration(0);
      setUpNext(null);
      setPlaying((opts?.autoplay ?? true) && payload.units.length > 0);
    } catch (err) {
      if (token !== loadToken.current) return;
      setError(err instanceof Error ? err.message : "Failed to load chapter");
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, []);

  // Swap the source when the current unit changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = `/api/audio/${current.hash}`;
    audio.playbackRate = speed;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    if (playingRef.current) attemptPlay(audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.hash]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) attemptPlay(audio);
    else audio.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // "Up next" countdown at the end of a chapter; rolls into the next one.
  useEffect(() => {
    if (upNext === null || !data) return;
    if (upNext <= 0) {
      if (data.nextIdx !== null) void load({ bookId: data.bookId, idx: data.nextIdx });
      return;
    }
    const timer = setTimeout(
      () => setUpNext((value) => (value === null ? null : value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [upNext, data, load]);

  useEffect(() => {
    return () => {
      if (gapTimer.current) clearTimeout(gapTimer.current);
    };
  }, []);

  // Media Session (OS media keys, lock screen).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !data) return;
    const media = navigator.mediaSession;
    media.metadata = new MediaMetadata({
      title: data.chapterTitle,
      artist: data.author,
      album: data.bookTitle,
      artwork: data.coverUrl ? [{ src: data.coverUrl }] : [],
    });
    media.setActionHandler("play", () => {
      setUpNext(null);
      setPlaying(true);
    });
    media.setActionHandler("pause", () => setPlaying(false));
    media.setActionHandler("previoustrack", () => setIndex((i) => Math.max(0, i - 1)));
    media.setActionHandler("nexttrack", () =>
      setIndex((i) => Math.min(data.units.length - 1, i + 1)),
    );
    media.setActionHandler("seekbackward", () => {
      if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15);
    });
    media.setActionHandler("seekforward", () => {
      if (audioRef.current) audioRef.current.currentTime += 15;
    });
    return () => {
      media.setActionHandler("play", null);
      media.setActionHandler("pause", null);
      media.setActionHandler("previoustrack", null);
      media.setActionHandler("nexttrack", null);
      media.setActionHandler("seekbackward", null);
      media.setActionHandler("seekforward", null);
    };
  }, [data]);

  function onEnded() {
    if (!data || !current) return;
    if (atLast) {
      setPlaying(false);
      if (data.nextIdx !== null) setUpNext(AUTO_NEXT_SECONDS);
      return;
    }
    const gap = PAUSE_SECONDS[current.pauseAfter] * 1000;
    const advance = () => setIndex((i) => Math.min(i + 1, data.units.length - 1));
    if (gap > 0) gapTimer.current = setTimeout(advance, gap);
    else advance();
  }

  const value = useMemo<PlayerContextValue>(
    () => ({
      data,
      current,
      index,
      playing,
      speed,
      volume,
      currentTime,
      duration,
      needsGesture,
      upNext,
      loading,
      error,
      load,
      toggle: () => {
        setNeedsGesture(false);
        setUpNext(null);
        setPlaying((p) => !p);
      },
      play: () => {
        setUpNext(null);
        setPlaying(true);
      },
      pause: () => setPlaying(false),
      nextUnit: () => setIndex((i) => (data ? Math.min(i + 1, data.units.length - 1) : i)),
      prevUnit: () => setIndex((i) => Math.max(0, i - 1)),
      jumpTo: (i: number) => setIndex(Math.max(0, Math.min(i, (data?.units.length ?? 1) - 1))),
      seek: (seconds: number) => {
        if (audioRef.current) audioRef.current.currentTime = seconds;
      },
      setSpeed: (v: number) => setSpeedState(v),
      setVolume: (v: number) => setVolumeState(Math.max(0, Math.min(1, v))),
      cancelUpNext: () => setUpNext(null),
      playNextChapter: () => {
        if (data?.nextIdx != null) void load({ bookId: data.bookId, idx: data.nextIdx });
      },
    }),
    [data, current, index, playing, speed, volume, currentTime, duration, needsGesture, upNext, loading, error, load],
  );

  return (
    <PlayerContext.Provider value={value}>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={onEnded}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
      />
      {children}
    </PlayerContext.Provider>
  );
}

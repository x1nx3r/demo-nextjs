import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  FileText,
  Headphones,
  Mic2,
  Play,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "ChattyPub — every book becomes a full-cast audiobook",
  description:
    "Import an EPUB, PDF, TXT, Markdown, or a link. The Director casts each character with a distinct voice, then narrates with emotion and pace.",
};

const BARS = [0.5, 0.9, 0.35, 0.72, 1, 0.6, 0.45, 0.88, 0.3, 0.76, 0.55, 0.95, 0.4, 0.68];

const FEATURES = [
  {
    icon: Users,
    title: "A cast, not a reader",
    body: "Each character keeps a distinct voice. The Director casts your book as it reads and remembers every voice.",
  },
  {
    icon: FileText,
    title: "Any format",
    body: "Import an EPUB, PDF, TXT, or Markdown file. Or paste a link and listen to the article.",
  },
  {
    icon: Sparkles,
    title: "Expressive delivery",
    body: "Emotion, pace, and pauses come from the text itself, not a flat monotone.",
  },
  {
    icon: Headphones,
    title: "Built to listen",
    body: "A dark, focused player with resume, auto-advance, and a persistent now-playing bar.",
  },
];

const STEPS = [
  {
    icon: BookOpen,
    title: "Import",
    body: "Drop a file or paste a link. The parser finds the chapters.",
  },
  {
    icon: Mic2,
    title: "Cast",
    body: "The Director assigns a voice to each character and holds it across chapters.",
  },
  {
    icon: Play,
    title: "Listen",
    body: "Play chapter by chapter, or let the whole book run.",
  },
];

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/library");

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(30,215,96,0.16),transparent_70%)]"
      />

      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-6">
          <Link href="/" className="flex items-center gap-2">
            <Headphones className="size-6 text-brand" />
            <span className="font-heading text-lg font-bold tracking-tight">ChattyPub</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-6 text-sm text-text-secondary md:flex">
            <Link href="#features" className="transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#how" className="transition-colors hover:text-foreground">
              How it works
            </Link>
          </nav>

          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "ml-auto")}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Hero */}
        <section className="grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-bold tracking-wide text-text-secondary uppercase">
              <span className="size-1.5 rounded-full bg-brand" />
              EPUB · PDF · TXT · Markdown · Links
            </span>

            <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
              Every book becomes a <span className="text-brand whitespace-nowrap">full-cast</span>{" "}
              audiobook.
            </h1>

            <p className="max-w-lg text-lg text-text-secondary">
              ChattyPub reads your books and performs them. The Director gives every character a
              distinct voice, then narrates with emotion and pace.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                <Play className="size-4" />
                Start listening
              </Link>
              <Link
                href="#how"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                See how it works
              </Link>
            </div>

            <p className="text-sm text-text-secondary">
              Sign in with Google. No credit card.
            </p>
          </div>

          {/* Player mock */}
          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-brand/10 blur-2xl" aria-hidden />
            <div className="relative rounded-3xl border border-border/60 bg-card p-5 shadow-dialog">
              <div className="flex items-center gap-4">
                <div className="size-20 shrink-0 rounded-xl bg-gradient-to-br from-brand/70 via-info/40 to-[#7c3aed]/50" />
                <div className="min-w-0">
                  <p className="text-label text-text-secondary">Now playing</p>
                  <p className="mt-1 truncate font-heading text-lg font-bold">
                    Chapter 1 · The Lighthouse
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["Narrator", "Elena", "Marcus"].map((name) => (
                      <span
                        key={name}
                        className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-text-secondary"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex h-16 items-end gap-1.5">
                {BARS.map((height, index) => (
                  <span
                    key={index}
                    className="w-1.5 flex-1 rounded-full bg-brand/80"
                    style={{
                      height: `${height * 100}%`,
                      transformOrigin: "bottom",
                      animation: `eq-bar 1.1s ease-in-out ${index * 0.09}s infinite`,
                    }}
                  />
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <span className="text-xs tabular-nums text-text-secondary">12:04</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-2/5 rounded-full bg-brand" />
                </div>
                <span className="text-xs tabular-nums text-text-secondary">31:52</span>
              </div>

              <div className="mt-5 space-y-1">
                {[
                  { title: "Chapter 2 · Low Tide", voice: "Elena" },
                  { title: "Chapter 3 · The Keeper", voice: "Marcus" },
                  { title: "Chapter 4 · Landfall", voice: "Narrator" },
                ].map((row) => (
                  <div
                    key={row.title}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary/60"
                  >
                    <Play className="size-4 shrink-0 text-text-secondary" />
                    <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
                    <span className="shrink-0 text-xs text-text-secondary">{row.voice}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 py-12 md:py-16">
          <h2 className="font-heading text-3xl font-bold tracking-tight">
            A better way to listen
          </h2>
          <p className="mt-2 max-w-xl text-text-secondary">
            Most narration flattens a book into one voice. ChattyPub hears the cast.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-6 transition-colors hover:border-border-light/50"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="font-heading text-lg font-bold">{feature.title}</h3>
                <p className="text-sm text-text-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-12 md:py-16">
          <h2 className="font-heading text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-xl text-text-secondary">Three steps from a file to a performance.</p>

          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <step.icon className="size-5" />
                  </div>
                  <span className="font-heading text-sm font-bold text-text-secondary">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="font-heading text-lg font-bold">{step.title}</h3>
                <p className="text-sm text-text-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="py-12 md:py-20">
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-brand/15 via-card to-card p-10 text-center md:p-16">
            <h2 className="mx-auto max-w-2xl font-heading text-3xl leading-tight font-bold tracking-tight text-balance md:text-4xl">
              Bring your library to life.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-text-secondary">
              Import your first book and hear it performed in minutes.
            </p>
            <Link
              href="/login"
              className={cn(buttonVariants({ size: "lg" }), "mt-8 gap-2")}
            >
              <Play className="size-4" />
              Start listening
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-text-secondary sm:flex-row">
          <div className="flex items-center gap-2">
            <Headphones className="size-4 text-brand" />
            <span>ChattyPub</span>
          </div>
          <p>A personal project. Bring your own provider keys.</p>
        </div>
      </footer>
    </div>
  );
}

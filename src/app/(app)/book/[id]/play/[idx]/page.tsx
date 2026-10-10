import { notFound, redirect } from "next/navigation";

import { NowPlaying } from "@/components/player/now-playing";
import { getSession } from "@/lib/auth";
import { getBook } from "@/lib/store/books";
import { setTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string; idx: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  setTenant(session.uid);

  const { id, idx } = await params;
  const chapterIdx = Number.parseInt(idx, 10);
  if (!Number.isInteger(chapterIdx) || chapterIdx < 0) notFound();

  const book = await getBook(id);
  if (!book) notFound();

  const chapter = book.chapters.find((entry) => entry.idx === chapterIdx);
  if (!chapter) notFound();

  return <NowPlaying bookId={id} idx={chapterIdx} />;
}

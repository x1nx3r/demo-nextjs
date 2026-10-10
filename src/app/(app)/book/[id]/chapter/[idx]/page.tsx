import { notFound, redirect } from "next/navigation";

import { ChapterWorkbench } from "@/components/chapters/chapter-workbench";
import { getSession } from "@/lib/auth";
import { getBook } from "@/lib/store/books";
import { getChapterScript } from "@/lib/store/chunks";
import { getJob } from "@/lib/store/jobs";
import { setTenant } from "@/lib/tenant";
import { getCast, resolveVoicePool } from "@/lib/tts/cast";

export const dynamic = "force-dynamic";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string; idx: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  setTenant(session.uid);

  const { id, idx } = await params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) notFound();

  const book = await getBook(id);
  if (!book) notFound();

  const chapter = book.chapters.find((entry) => entry.idx === index);
  if (!chapter) notFound();

  const [script, job, cast] = await Promise.all([
    getChapterScript(id, index),
    getJob(id, index),
    getCast(id),
  ]);

  return (
    <ChapterWorkbench
      bookId={id}
      idx={index}
      bookTitle={book.title}
      chapter={{
        title: chapter.title,
        charCount: chapter.charCount,
        status: chapter.status,
        unitCount: chapter.unitCount,
        unitsDone: chapter.unitsDone,
      }}
      initialScript={script}
      initialJob={job}
      initialCast={cast}
      initialPool={resolveVoicePool()}
    />
  );
}

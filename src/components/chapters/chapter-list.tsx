import { ChapterRow } from "@/components/chapters/chapter-row";
import type { ChapterMeta } from "@/lib/store/books";

export function ChapterList({
  bookId,
  chapters,
}: {
  bookId: string;
  chapters: ChapterMeta[];
}) {
  return (
    <ol className="flex flex-col">
      {chapters.map((chapter) => (
        <ChapterRow key={chapter.idx} bookId={bookId} chapter={chapter} />
      ))}
    </ol>
  );
}

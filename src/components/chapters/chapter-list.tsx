import { Button } from "@/components/ui/button";
import { formatChars } from "@/lib/format";
import type { ChapterMeta, ChapterStatus } from "@/lib/store/books";

const STATUS_LABELS: Record<ChapterStatus, string> = {
  imported: "Imported",
  ingested: "Ingested",
  converting: "Converting",
  partial: "Partial",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_CLASSES: Record<ChapterStatus, string> = {
  imported: "bg-secondary text-muted-foreground",
  ingested: "bg-info/15 text-info",
  converting: "bg-warning/15 text-warning",
  partial: "bg-warning/15 text-warning",
  ready: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

function actionLabel(status: ChapterStatus): string {
  switch (status) {
    case "imported":
      return "Ingest";
    case "ingested":
      return "Convert";
    case "ready":
      return "Play";
    case "partial":
      return "Resume";
    case "converting":
      return "Converting";
    default:
      return "Retry";
  }
}

export function ChapterList({ chapters }: { chapters: ChapterMeta[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {chapters.map((chapter) => (
        <li
          key={chapter.idx}
          className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
        >
          <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
            {chapter.idx + 1}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{chapter.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatChars(chapter.charCount)}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${STATUS_CLASSES[chapter.status]}`}
          >
            {STATUS_LABELS[chapter.status]}
          </span>

          <Button size="sm" disabled className="shrink-0">
            {actionLabel(chapter.status)}
          </Button>
        </li>
      ))}
    </ol>
  );
}

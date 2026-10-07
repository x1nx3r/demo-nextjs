export function formatChars(count: number): string {
  if (count < 1000) return `${count} chars`;
  if (count < 100000) return `${(count / 1000).toFixed(1)}k chars`;
  return `${Math.round(count / 1000)}k chars`;
}

export function formatAuthors(author: string | null): string {
  return author && author.trim().length > 0 ? author : "Unknown author";
}

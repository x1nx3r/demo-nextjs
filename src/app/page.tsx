import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { logout } from "./actions";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">EPUB to audiobook</p>
          <h1 className="font-heading text-2xl font-semibold">Audiobook</h1>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Foundation ready</CardTitle>
          <CardDescription>
            P0 — Macchiato theme, login gate and RustFS wiring are in place.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Next up: EPUB import and the chapter list.
        </CardContent>
      </Card>
    </main>
  );
}

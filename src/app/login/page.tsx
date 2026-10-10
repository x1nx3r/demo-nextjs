"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { firebaseAuth } from "@/lib/firebase/client";

function errorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code.includes("popup-closed-by-user")) return "The sign-in popup was closed.";
  if (code.includes("popup-blocked")) return "Your browser blocked the sign-in popup.";
  if (code.includes("operation-not-allowed")) return "Google sign-in is not enabled.";
  return "Something went wrong. Try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onGoogle() {
    setPending(true);
    setError(null);
    try {
      const result = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      const idToken = await result.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) throw new Error("Could not start your session.");
      router.push("/library");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3">
        <Image
          src="/chattypub.png"
          alt="ChattyPub"
          width={80}
          height={80}
          className="size-20 object-contain"
          priority
        />
        <div className="space-y-1 text-center">
          <h1 className="font-heading text-2xl font-semibold">ChattyPub</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Continue with your Google account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" className="w-full" onClick={onGoogle} disabled={pending}>
            {pending ? "Signing in..." : "Continue with Google"}
          </Button>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

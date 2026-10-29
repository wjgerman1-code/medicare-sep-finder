"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-20 text-center">
      <AlertTriangle className="h-10 w-10 text-warning" />
      <h1 className="font-serif text-2xl font-semibold text-navy">Something went wrong loading this page</h1>
      <p className="text-sm text-muted-foreground">{error.digest ? `Reference: ${error.digest}` : "Please try again."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

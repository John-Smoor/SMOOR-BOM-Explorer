"use client";
import { Button, Notice } from "@/components/ui";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Notice tone="error" title="This page couldn't load" action={<Button onClick={reset}>Try again</Button>}>
      {error.message || "Check that the data folder is reachable, then try again."}
    </Notice>
  );
}

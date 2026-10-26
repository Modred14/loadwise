"use client";
import { Banner, Button } from "@/components/ui";

export default function Error({ reset }) {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <Banner title="Something went wrong" action={<Button variant="secondary" onClick={reset}>Try again</Button>}>
        The page hit an unexpected problem. Your data is safe on the server.
      </Banner>
    </main>
  );
}

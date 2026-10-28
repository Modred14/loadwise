"use client";
import { Banner, Button } from "@/components/ui";
import { LogoMark } from "@/components/brand";

export default function Error({ reset }) {
  return (
    <main id="main" className="mx-auto w-full max-w-xl p-6 pt-16">
      <LogoMark size={36} />
      <h1 className="t-page mt-6 mb-5">Something went wrong.</h1>
      <Banner title="The page hit an unexpected problem" action={<Button variant="secondary" onClick={reset}>Try again</Button>}>
        Your data is safe on the server.
      </Banner>
    </main>
  );
}

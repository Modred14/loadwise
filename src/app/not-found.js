import Link from "next/link";
import { LogoMark } from "@/components/brand";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-start justify-center p-6">
      <LogoMark size={36} />
      <p className="t-label mt-8">Error 404</p>
      <h1 className="t-display mt-2 text-[3.5rem]">That page does not exist.</h1>
      <p className="t-small mt-4 text-[0.9375rem]">The link may be old or mistyped.</p>
      <Link href="/dashboard" className="mt-7 inline-flex min-h-12 items-center rounded-md bg-primary px-6 text-sm font-medium text-white shadow-key transition-[transform,box-shadow] hover:-translate-y-px hover:bg-primary-hover active:translate-y-0.5 active:shadow-none">Go to dashboard</Link>
    </main>
  );
}

import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-start justify-center p-6">
      <p className="t-label">404</p>
      <h1 className="t-page mt-1">That page does not exist</h1>
      <p className="t-small mt-2">The link may be old or mistyped.</p>
      <Link href="/dashboard" className="mt-5 flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover">Go to dashboard</Link>
    </main>
  );
}

import Link from "next/link";
import { AlertTriangle, CalendarClock, Gauge, ListChecks } from "lucide-react";
import { CATEGORIES } from "@/lib/engine/config";
import { Logo } from "@/components/AppShell";

const FEATURES = [
  { icon: ListChecks, title: "Every deadline in one place", body: "Add your courses, tests, assignments, continuous assessments, projects and exams, each with an estimate of the preparation they need." },
  { icon: Gauge, title: "A workload score you can understand", body: "A 0 to 100 score built from how close your deadlines are, whether the preparation fits your available hours, and how many pile up together. Every score comes with the reasons behind it." },
  { icon: AlertTriangle, title: "Warnings before it becomes an emergency", body: "Clustered deadlines, an exam without enough preparation time, an overdue task: you are told what the problem is, why it matters, and what to do next." },
  { icon: CalendarClock, title: "A study plan that respects your hours", body: "Sessions are scheduled before each deadline within the hours you actually have. When it cannot all fit, the plan says so and protects the most important work." },
];

const TONE = { low: "bg-ok-soft text-ok", medium: "bg-primary-soft text-primary", high: "bg-warn-soft text-warn", critical: "bg-crit-soft text-crit" };

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 lg:px-8">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link href="/login" className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-surface-2 md:min-h-9">Log in</Link>
            <Link href="/register" className="flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover md:min-h-9">Create account</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8 lg:py-20">
            <p className="t-label">Academic load tracker and study planner</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">See the crunch coming before it arrives.</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              When tests, assignments and exams land in the same week, a to-do list does not tell you what to do first or whether it all fits. LoadWise measures your real workload, warns you early, and plans your study time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover">Get started</Link>
              <Link href="/login" className="flex min-h-11 items-center rounded-md border border-line bg-surface px-5 text-sm font-medium hover:bg-surface-2">Log in</Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8">
          <h2 className="t-page">What it does</h2>
          <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <Icon size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="t-section">{title}</h3>
                  <p className="mt-1 text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8">
            <h2 className="t-page">How the score is read</h2>
            <p className="mt-2 max-w-2xl text-muted">The same four categories are used everywhere in the app. The score is a practical indicator based on what you enter, not a prediction of results.</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CATEGORIES.map((c) => (
                <li key={c.key} className={`rounded-lg p-4 ${TONE[c.key]}`}>
                  <p className="font-semibold">{c.label}</p>
                  <p className="tnum text-sm">Score {c.min} to {c.max}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted lg:px-8">LoadWise</div>
      </footer>
    </div>
  );
}

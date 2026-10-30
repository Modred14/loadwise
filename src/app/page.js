import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Gauge,
  ListChecks,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { LoadRail } from "@/components/viz";
import { WarningCard } from "@/components/WarningCard";
import Skyline from "@/components/landing/Skyline";
import ScoreExplorer from "@/components/landing/ScoreExplorer";

const keyBtn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-[0.9375rem] font-medium text-white shadow-key transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:bg-primary-hover active:translate-y-0.5 active:shadow-none";
const ghostBtn =
  "inline-flex min-h-12 items-center justify-center rounded-md border border-line-strong bg-surface px-6 text-[0.9375rem] font-medium transition-colors hover:border-ink hover:bg-surface-2";

const EXAMPLE_WARNING = {
  severity: "critical",
  title: "Not enough study time before Algorithms mid-semester test",
  why: "You need about 8h of preparation to finish everything due by this deadline, but only about 5h of study time is available.",
  nextStep:
    "Start today, add study hours in your preferences, or move lower-priority work.",
};

function Specimen({ children, label = "Example" }) {
  return (
    <div className="mt-5">
      <p className="t-label mb-2">{label}</p>
      {children}
    </div>
  );
}

const SAMPLE_TASKS = [
  ["MTH204", "#2f8a5f", "Eigenvalues problem set", "Due in 2 days", "4h"],
  ["CSC301", "#3d55c7", "Algorithms mid-semester test", "Due tomorrow", "6h"],
  ["PHY210", "#8a4fb0", "Lab report: Faraday induction", "Due in 3 days", "3h"],
];
const SAMPLE_WEEK = [
  [1, 2],
  [2, 3],
  [1, 1],
  [3, 2],
  [2, 1],
  [0, 0],
  [1, 0],
];

const FEATURES = [
  {
    icon: ListChecks,
    title: "Every deadline in one place",
    body: "Add your courses, tests, assignments, continuous assessments, projects and exams, each with an estimate of the preparation they need.",
    specimen: (
      <Specimen>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {SAMPLE_TASKS.map(([code, color, title, due, h]) => (
            <li
              key={title}
              className="flex items-center gap-3 py-2.5 pr-3 pl-4 text-sm"
              style={{ boxShadow: `inset 3px 0 0 ${color}` }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{title}</span>
                <span className="t-small">
                  <span className="font-mono text-ink">{code}</span> · {due}
                </span>
              </span>
              <span className="tnum font-mono text-[0.8125rem]">{h}</span>
            </li>
          ))}
        </ul>
      </Specimen>
    ),
  },
  {
    icon: Gauge,
    title: "A workload score you can understand",
    body: "A 0 to 100 score built from how close your deadlines are, whether the preparation fits your available hours, and how many pile up together. Every score comes with the reasons behind it.",
    specimen: (
      <Specimen>
        <div className="panel rounded-lg p-4">
          <div className="flex items-end gap-3">
            <span className="t-num tnum text-[3.5rem]">64</span>
            <span
              className="pb-1 text-sm font-semibold"
              style={{ color: "var(--zone-high)" }}
            >
              High load
            </span>
          </div>
          <LoadRail score={64} className="mt-3" height="2rem" />
        </div>
      </Specimen>
    ),
  },
  {
    icon: AlertTriangle,
    title: "Warnings before it becomes an emergency",
    body: "Clustered deadlines, an exam without enough preparation time, an overdue task: you are told what the problem is, why it matters, and what to do next.",
    specimen: (
      <Specimen>
        <WarningCard w={EXAMPLE_WARNING} course={{ code: "CSC301" }} />
      </Specimen>
    ),
  },
  {
    icon: CalendarClock,
    title: "A study plan that respects your hours",
    body: "Sessions are scheduled before each deadline within the hours you actually have. When it cannot all fit, the plan says so and protects the most important work.",
    specimen: (
      <Specimen>
        <div
          className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line"
          aria-hidden
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="bg-surface p-1.5">
              <p className="t-label text-center text-[0.625rem]">{d}</p>
              <div className="mt-1.5 flex min-h-20 flex-col gap-1">
                {SAMPLE_WEEK[i].map((c, j) =>
                  c ? (
                    <span
                      key={j}
                      className="block rounded-xs border-l-[3px]"
                      style={{
                        height: 14 + c * 8,
                        borderColor: ["#3d55c7", "#2f8a5f", "#8a4fb0"][c - 1],
                        background: `color-mix(in srgb, ${["#3d55c7", "#2f8a5f", "#8a4fb0"][c - 1]} 16%, var(--surface))`,
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      </Specimen>
    ),
  },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 lg:px-8">
          <Logo />
          <nav
            aria-label="Sections"
            className="hidden items-center gap-7 text-sm font-medium text-muted md:flex"
          >
            <a href="#features" className="hover:text-ink">
              What it does
            </a>
            <a href="#score" className="hover:text-ink">
              The score
            </a>
          </nav>
          <nav aria-label="Account" className="flex items-center gap-1.5">
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-surface-2"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white shadow-key transition-transform hover:-translate-y-px hover:bg-primary-hover active:translate-y-0.5 active:shadow-none"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-10 pb-14 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pt-16 lg:pb-20">
          <div className="lg:col-span-6">
            <p className="t-label">
              Academic load tracker · early warnings · study planner
            </p>
            <h1 className="t-display mt-5 text-[3rem] text-balance sm:text-[4rem] lg:text-[5rem]">
              See the crunch <em className="text-primary">coming</em> before it
              arrives.
            </h1>
            <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-muted">
              When tests, assignments and exams land in the same week, a to-do
              list does not tell you what to do first or whether it all fits.
              LoadWise measures your real workload, warns you early, and plans
              your study time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={keyBtn}>
                Get started <ArrowRight size={16} aria-hidden />
              </Link>
              <Link href="/login" className={ghostBtn}>
                Log in
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 divide-x divide-line border-y border-line-strong py-4">
              <div className="flex flex-col-reverse pr-4">
                <dt className="t-label mt-2">Workload score</dt>
                <dd className="t-num text-[2.25rem]">0–100</dd>
              </div>
              <div className="flex flex-col-reverse px-4">
                <dt className="t-label mt-2">Load levels</dt>
                <dd className="t-num text-[2.25rem]">4</dd>
              </div>
              <div className="flex flex-col-reverse pl-4">
                <dt className="t-label mt-2">Look-ahead</dt>
                <dd className="t-num text-[2.25rem]">14d</dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-6">
            <div className="panel overflow-hidden rounded-lg p-4 pb-5 sm:p-6 sm:pb-7">
              <div className="flex items-center justify-between">
                <p className="t-label">Example fortnight</p>
                <p className="t-label" style={{ color: "var(--zone-high)" }}>
                  Load 78 · High
                </p>
              </div>
              <div className="-mt-2 sm:-mt-4">
                <Skyline />
              </div>
              <LoadRail score={78} height="2.25rem" className="mt-1" />
              <p className="t-small mt-3">
                Each column is a day; its height is the preparation due.
                Illustration only.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-line-strong">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-20">
            <div className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
              <p className="t-label">What it does</p>
              <h2 className="t-page mt-3 text-balance lg:text-[3rem]">
                Four things a to-do list cannot do.
              </h2>
            </div>
            <ol className="flex flex-col gap-12 lg:col-span-8">
              {FEATURES.map((f, i) => (
                <li
                  key={f.title}
                  className="grid gap-x-6 sm:grid-cols-[4rem_1fr]"
                >
                  <span
                    className="t-num text-[2.75rem] text-[#857e6c] sm:text-[3.5rem]"
                    aria-hidden
                  >
                    0{i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                      <f.icon size={20} className="text-primary" aria-hidden />
                      {f.title}
                    </h3>
                    <p className="mt-2 max-w-xl text-muted">{f.body}</p>
                    {f.specimen}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Score explorer */}
        <section id="score" className="panel">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
            <p className="t-label">How the score is read</p>
            <h2 className="t-page mt-3 mb-10 max-w-2xl text-balance lg:text-[3rem]">
              One number, four levels, used everywhere.
            </h2>
            <ScoreExplorer />
          </div>
        </section>

        {/* Closing */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center lg:px-8 lg:py-24">
          <h2 className="t-display mx-auto max-w-3xl text-[2.5rem] text-balance sm:text-[3.5rem]">
            Start with your courses. The rest follows.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Add what is due and how long it will take. LoadWise does the
            weighing, warning and planning.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={keyBtn}>
              Create your account <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/login" className={ghostBtn}>
              Log in
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-strong">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted lg:px-8">
          <Logo />
          <p className="max-w-md">
            A practical indicator based on what you enter. Not a prediction of
            academic outcomes.
          </p>
        </div>
      </footer>
    </div>
  );
}

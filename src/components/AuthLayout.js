// src/components/AuthLayout.js
import { Logo } from "@/components/brand";

// A load "crunch": ticks rise to a peak, the same ruler language as the logo and the load rail.
// Computed from integers so server and client render identical markup.
const TICKS = Array.from({ length: 40 }, (_, i) => {
  const h = 14 + 78 * Math.exp(-((i - 28) ** 2) / 55) + (i % 5 === 0 ? 8 : 0);
  return { h: Math.round(Math.min(h, 100)), peak: i >= 25 && i <= 31 };
});

const POINTS = [
  ["Every deadline in one place", "Tests, assignments and exams, each with the preparation it needs."],
  ["Warnings before the crunch", "What is wrong, why it matters, and what to do next."],
  ["A plan that fits your hours", "Study sessions scheduled before each deadline."],
];

/** Two-column auth screen: solid brand panel on the left (desktop), form on the right. */
export function AuthLayout({ headline, children }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-primary p-10 text-white lg:flex xl:p-14">
        <Logo inverse />
        <div>
          <h2 className="font-display max-w-lg text-[3.25rem] leading-[1.02] tracking-tight text-balance xl:text-[4rem]">{headline}</h2>
          <div className="mt-10 flex h-28 max-w-md items-end gap-[3px]" aria-hidden>
            {TICKS.map((t, i) => (
              <i key={i} className={t.peak ? "flex-1 bg-white" : "flex-1 bg-white/40"} style={{ height: `${t.h}%` }} />
            ))}
          </div>
          <ul className="mt-10 max-w-md divide-y divide-white/20 border-y border-white/20">
            {POINTS.map(([t, b]) => (
              <li key={t} className="py-3 text-sm">
                <span className="font-semibold">{t}.</span> <span className="text-white/80">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[0.8125rem] text-white/75">A practical indicator, not a prediction of academic outcomes.</p>
      </aside>

      <main id="main" className="flex flex-col px-5 py-6 sm:px-10 lg:justify-center lg:px-16">
        <div className="mb-10 lg:hidden"><Logo /></div>
        <div className="anim-page mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, lead }) {
  return (
    <header>
      <h1 className="font-display text-[2.25rem] leading-[1.05] tracking-tight sm:text-[2.5rem]">{title}</h1>
      {lead ? <p className="mt-2 text-[0.9375rem] text-muted">{lead}</p> : null}
    </header>
  );
}
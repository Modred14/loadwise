"use client";
import { useState } from "react";
import { CATEGORIES, SCORE_WEIGHTS } from "@/lib/engine/config";
import { LoadRail } from "@/components/viz";

const MEANING = {
  low: "Comfortable. You have room to get ahead, and no deadline is squeezing you.",
  medium: "Steady. There is real work, but it fits. Keep an eye on the next deadlines.",
  high: "Heavy. Deadlines are close or stacked. Plan carefully and protect study time.",
  critical: "Overloaded. Preparation will not fit before some deadlines. Act on the warnings first.",
};
const PARTS = [
  ["Urgency", SCORE_WEIGHTS.urgency, "How much weighted work sits close to now."],
  ["Time squeeze", SCORE_WEIGHTS.squeeze, "Whether preparation fits the hours you can study before each deadline."],
  ["Overlap", SCORE_WEIGHTS.crunch, "How many deadlines fall inside your busiest three days."],
];

/** Drag the score to see how the four categories read on the same rail used in the app. */
export default function ScoreExplorer() {
  const [score, setScore] = useState(68);
  const cat = CATEGORIES.find((c) => score >= c.min && score <= c.max) ?? CATEGORIES[0];
  return (
    <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="lg:col-span-7">
        <div className="flex items-end gap-5">
          <output htmlFor="score-range" className="t-num tnum text-[6rem] sm:text-[8rem]" aria-live="polite">{score}</output>
          <div className="pb-3 sm:pb-5">
            <p className="t-label">of 100</p>
            <p className="mt-2 inline-flex items-center gap-2 text-base font-semibold" style={{ color: `var(--zone-${cat.key})` }}><span className="size-3" style={{ background: `var(--zone-${cat.key})` }} aria-hidden />{cat.label} load</p>
          </div>
        </div>
        <LoadRail score={score} className="mt-6" height="3.25rem" />
        <label htmlFor="score-range" className="sr-only">Example workload score</label>
        <input id="score-range" type="range" min="0" max="100" value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-6 h-11 w-full cursor-pointer accent-(--signal)" aria-describedby="score-meaning" />
        <p id="score-meaning" className="mt-3 max-w-lg text-[0.9375rem] text-panel-ink/85">{MEANING[cat.key]}</p>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Jump to a category">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" aria-pressed={c.key === cat.key} onClick={() => setScore(Math.round((c.min + c.max) / 2))}
              className="min-h-11 rounded-md border border-(--panel-line) px-4 text-sm font-medium text-panel-ink transition-colors hover:border-(--signal) aria-pressed:border-(--signal) aria-pressed:bg-(--signal) aria-pressed:text-ink">{c.label}</button>
          ))}
        </div>
      </div>
      <div className="lg:col-span-5">
        <p className="t-label">What goes into the number</p>
        <dl className="mt-4 divide-y divide-(--panel-line) border-y border-(--panel-line)">
          {PARTS.map(([name, w, help]) => (
            <div key={name} className="flex items-start gap-4 py-4">
              <dd className="t-num tnum w-16 shrink-0 text-[2.25rem]">{Math.round(w * 100)}<span className="text-xl text-(--panel-muted)">%</span></dd>
              <dt className="min-w-0"><span className="block font-semibold">{name}</span><span className="t-small mt-0.5 block font-normal">{help}</span></dt>
            </div>
          ))}
          <div className="flex items-start gap-4 py-4"><dd className="t-num w-16 shrink-0 text-[2.25rem]">+</dd><dt><span className="block font-semibold">Overdue penalty</span><span className="t-small mt-0.5 block font-normal">Added for each task already past its deadline.</span></dt></div>
        </dl>
        <p className="t-small mt-4">A practical indicator based on what you enter, not a prediction of results.</p>
      </div>
    </div>
  );
}

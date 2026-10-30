// src/components/brand.js
import Link from "next/link";

/** The LoadWise mark: six ticks rising toward the tallest tick (the same ruler language as the load rail). */
export function LogoMark({ size = 28, className, inverse = false }) {
  const heights = [6, 8.5, 11, 14, 18, 22];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="4" fill={inverse ? "#ffffff" : "#1f2f8a"} />
      {heights.map((h, i) => (
        <rect key={i} x={5.4 + i * 3.9} y={27 - h} width="2.5" height={h} fill={inverse ? "#1f2f8a" : "#ffffff"} fillOpacity={i === 5 ? 1 : 0.72} />
      ))}
    </svg>
  );
}

export function Logo({ href = "/", dark = false, inverse = false }) {
  return (
    <Link href={href} className={`flex min-h-11 items-center gap-2.5 ${inverse ? "text-white" : dark ? "text-panel-ink" : "text-ink"}`} aria-label="LoadWise home">
      <LogoMark inverse={inverse} />
      <span className="font-display text-[1.5rem] leading-none tracking-tight">LoadWise</span>
    </Link>
  );
}
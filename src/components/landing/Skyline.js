"use client";
import { useEffect, useRef } from "react";

// Two illustrative weeks (7 days across, 2 weeks deep). Height = preparation due that day.
const DAYS = [3, 5, 4, 9, 13, 20, 7, 6, 24, 31, 18, 11, 5, 4];
const zone = (v) => (v >= 24 ? "critical" : v >= 15 ? "high" : v >= 8 ? "medium" : "low");
const COLS = 7;

/**
 * Isometric "load skyline" built from CSS cuboids. Purely illustrative: it shows the idea of
 * workload piling up before deadlines. Pointer movement tilts the scene a few degrees.
 */
export default function Skyline() {
  const wrap = useRef(null);
  const scene = useRef(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        scene.current?.style.setProperty("--tx", `${(nx * 16).toFixed(2)}deg`);
        scene.current?.style.setProperty("--ty", `${(-ny * 8).toFixed(2)}deg`);
      });
    };
    const leave = () => { scene.current?.style.setProperty("--tx", "0deg"); scene.current?.style.setProperty("--ty", "0deg"); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, []);

  return (
    <div ref={wrap} className="sky" role="img" aria-label="Illustration: two weeks of deadlines drawn as a 3D skyline. Columns rise toward a cluster of deadlines in the second week, shown in amber and red.">
      <div ref={scene} className="sky-scene" aria-hidden>
        <div className="sky-slab" />
        {DAYS.map((v, i) => {
          const col = i % COLS, row = Math.floor(i / COLS);
          return (
            <div key={i} className="sky-col" data-zone={zone(v)} style={{ left: `${9.5 + col * 11.6}%`, top: `${34 + row * 20}%`, "--h": v, "--n": i }}>
              <i className="top" /><i className="fr" /><i className="bk" /><i className="rt" /><i className="lf" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

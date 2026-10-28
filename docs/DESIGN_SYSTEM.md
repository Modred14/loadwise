# LoadWise design system

A precision instrument for academic load, set on warm paper. Solid colours only: **no gradients anywhere**.

## Principles
- **Near-square geometry.** Radii are 1 to 6px (`--radius-*`). Hairline borders, not heavy shadows.
- **Tactile keys.** Primary buttons carry a hard 2px edge (`shadow-key`) that compresses on press.
- **One signature instrument.** The *load rail* (`LoadRail` in `components/viz.js`) shows the score on a ruler of ticks coloured by zone. It is the same everywhere: sidebar, dashboard, insights, auth, landing.
- **Depth with purpose.** 3D appears only on the landing hero (`components/landing/Skyline.js`, pure CSS). App charts stay flat and exact so they can be read accurately.

## Tokens (`src/app/globals.css`)
| Group | Tokens |
| --- | --- |
| Paper and ink | `--bg` `--surface` `--surface-2` `--line` `--line-strong` `--ink` `--muted` |
| Brand | `--primary` `--primary-hover` `--primary-edge` `--primary-soft`; `--signal` (dark surfaces only) |
| Semantic | `--ok` `--warn` `--crit` (+ `-soft`), text-safe on their soft backgrounds |
| Zones (charts) | `--zone-low` `--zone-medium` `--zone-high` `--zone-critical` |
| Dark instrument | `.panel` re-maps `--muted`, `--line`, `--focus` and the zone colours for dark surfaces |

Type: Instrument Serif (`font-display`, vendored in `src/fonts`, SIL OFL) for headlines and numerals; Geist for UI; Geist Mono for labels and data. Classes: `t-display`, `t-page`, `t-section`, `t-label`, `t-small`, `t-num`. These live in `@layer components` so Tailwind utilities can override them.

Touch: `--ctl-h` is 36px, and 44px on `pointer: coarse` devices. Use `min-h-(--ctl-h)` on interactive controls.

## Components
- `components/ui.js`: Button, IconButton, Field, Input, Select, Textarea, Segmented, Card, CardHead, PageHeader, Badge, Banner, Progress, Skeleton, EmptyState, Dialog (bottom sheet on phones), ConfirmDialog, `ToastProvider` / `useToast`.
- `components/viz.js`: `LoadRail`, `ScoreMeter`, `FitCheck` (needed vs available hours per deadline), `Fortnight` (14-day strip).
- `components/domain.js`: `WarningItem`, `TaskDialog`, `CourseDialog`, `CourseTag`, `Pips`, `ReadyGate` (+ page-shaped skeletons).
- `lib/fit.js`: per-deadline view of the engine's squeeze calculation. Covered by a test that asserts it equals the engine's own ratio, so the chart cannot disagree with the score.
- `lib/courseColor.js`: stable colour per course.

## Motion
Short (150 to 450ms), eased with `--ease`, and entirely disabled under `prefers-reduced-motion`. Pointer tilt on the landing hero is skipped on touch devices.

## Accessibility
Verified with axe-core (WCAG 2.2 AA + best practices) on every page and an open dialog: zero violations. Skip link, visible focus, `aria-current`, `aria-pressed` toggles, live regions for toasts, labelled charts with text equivalents.

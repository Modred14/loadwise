// Stable colour per course so a course is recognisable across every screen.
// Uses the course's own `color` when the API provides a valid hex, otherwise a
// fixed palette indexed by the course's position in the list.
const PALETTE = ["#3d55c7", "#2f8a5f", "#c0562a", "#8a4fb0", "#0f7f8c", "#b08a1a", "#c13a6e", "#5f6b2a"];
const HEX = /^#[0-9a-f]{6}$/i;

export function courseColors(courses = []) {
  const map = new Map();
  courses.forEach((c, i) => map.set(c.id, HEX.test(c.color ?? "") ? c.color : PALETTE[i % PALETTE.length]));
  return map;
}

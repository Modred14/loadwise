// Stable colour per course so a course is recognisable across every screen.
// Always drawn from a fixed blue/black palette (indexed by the course's position in the
// list) so the site stays white, blue and black whatever colour the API sends.
const PALETTE = ["#3a52c4", "#000000", "#9db0f2", "#1f2f8a", "#6b86e6", "#0d1550", "#8095ec", "#2a3fa8"];

export function courseColors(courses = []) {
  const map = new Map();
  courses.forEach((c, i) => map.set(c.id, PALETTE[i % PALETTE.length]));
  return map;
}

import test from "node:test";
import assert from "node:assert/strict";
import { buildIcs, foldLine } from "./ics.js";

const NOW = new Date(Date.UTC(2026, 9, 26, 8, 0, 0));
const courses = [{ id: "c1", code: "CS201", name: "Algorithms" }];
const tasks = [
  { id: "t1", courseId: "c1", title: "Final, Exam; part 1", type: "exam", dueDate: "2026-10-28", dueTime: "09:00", estimatedHours: 8, status: "todo" },
  { id: "t2", courseId: "c1", title: "Lab report", type: "assignment", dueDate: "2026-10-30", status: "todo" },
  { id: "t3", courseId: "c1", title: "Done already", type: "test", dueDate: "2026-10-29", status: "completed" },
  { id: "t4", courseId: "c1", title: "Bad date", type: "test", dueDate: "nope", status: "todo" },
];
const sessions = [
  { id: "s1", taskId: "t1", courseId: "c1", startsAt: "2026-10-26T18:00", endsAt: "2026-10-26T19:30", status: "planned", reason: "Exam in 2 days" },
  { id: "s2", taskId: "t1", courseId: "c1", startsAt: "2026-10-27T18:00", endsAt: "2026-10-27T19:00", status: "completed" },
];

test("only open tasks with valid dates and planned sessions are exported", () => {
  const { text, count } = buildIcs({ tasks, sessions, courses, now: NOW });
  assert.equal(count, 3);
  assert.ok(!text.includes("Done already") && !text.includes("Bad date"));
  assert.ok(text.includes("UID:session-s1@loadwise") && !text.includes("session-s2"));
});

test("uses CRLF line endings, escapes text and keeps local wall-clock times", () => {
  const { text } = buildIcs({ tasks, sessions, courses, now: NOW });
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n") && text.endsWith("END:VCALENDAR\r\n"));
  assert.ok(text.includes("Final\\, Exam\\; part 1"));
  assert.ok(text.includes("DTSTART:20261028T090000"));
  assert.ok(text.includes("DTSTART;VALUE=DATE:20261030") && text.includes("DTEND;VALUE=DATE:20261031"));
  assert.ok(text.includes("DTSTAMP:20261026T080000Z"));
});

test("reminders: a day before, two hours before major timed assessments, 10 minutes before sessions", () => {
  const { text } = buildIcs({ tasks, sessions, courses, now: NOW });
  assert.ok(text.includes("TRIGGER:-P1D") && text.includes("TRIGGER:-PT2H") && text.includes("TRIGGER:-PT10M"));
});

test("long lines are folded at 75 octets without splitting characters", () => {
  const long = "SUMMARY:" + "é".repeat(60);
  const folded = foldLine(long);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), long);
});

test("empty input yields a valid empty calendar", () => {
  const { text, count } = buildIcs({ now: NOW });
  assert.equal(count, 0);
  assert.ok(text.includes("BEGIN:VCALENDAR") && !text.includes("BEGIN:VEVENT"));
});

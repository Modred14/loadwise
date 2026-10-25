const REFERENCE_DATE = new Date("2026-10-23T00:00:00");

const createDateFromToday = (offsetDays) => {
  const date = new Date(REFERENCE_DATE);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
};

const formatDate = (value) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

const daysUntil = (dateValue) => {
  const today = new Date(REFERENCE_DATE);
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
};

const courseData = [
  { id: "cs201", code: "CS201", title: "Algorithms & Complexity", tasks: 3, hours: 8, workload: 84 },
  { id: "bio110", code: "BIO110", title: "Cell Biology", tasks: 2, hours: 6, workload: 68 },
  { id: "his220", code: "HIS220", title: "Modern Governance", tasks: 2, hours: 5, workload: 51 },
  { id: "eng310", code: "ENG310", title: "Research Writing", tasks: 1, hours: 4, workload: 44 },
];

const taskData = [
  {
    id: "task-1",
    title: "Data Structures Lab Report",
    course: "CS201",
    type: "assignment",
    due: createDateFromToday(-2),
    effort: 5,
    completed: false,
    notable: "Overdue by 2 days",
  },
  {
    id: "task-2",
    title: "Algorithms Quiz",
    course: "CS201",
    type: "test",
    due: createDateFromToday(2),
    effort: 3,
    completed: false,
    notable: "High confidence",
  },
  {
    id: "task-3",
    title: "Cell Biology Midterm Review",
    course: "BIO110",
    type: "exam",
    due: createDateFromToday(4),
    effort: 6,
    completed: false,
    notable: "Material review",
  },
  {
    id: "task-4",
    title: "Comparative Essay Draft",
    course: "HIS220",
    type: "assignment",
    due: createDateFromToday(7),
    effort: 4,
    completed: false,
    notable: "Outline due soon",
  },
  {
    id: "task-5",
    title: "Research Methods CA",
    course: "ENG310",
    type: "ca",
    due: createDateFromToday(9),
    effort: 2,
    completed: true,
    notable: "Completed",
  },
  {
    id: "task-6",
    title: "Biology Practical Notes",
    course: "BIO110",
    type: "ca",
    due: createDateFromToday(11),
    effort: 3,
    completed: false,
    notable: "Needs revision",
  },
];

const plannerSlots = [
  { title: "Algorithms problem set", day: "Today", time: "18:00 - 19:30", duration: 90, priority: "High" },
  { title: "Biology concept map", day: "Tomorrow", time: "17:00 - 18:15", duration: 75, priority: "High" },
  { title: "Essay outline", day: "Thu", time: "18:30 - 19:30", duration: 60, priority: "Medium" },
  { title: "Reading review", day: "Fri", time: "16:00 - 17:00", duration: 60, priority: "Low" },
];

const severityTone = {
  Low: "var(--success-strong)",
  Medium: "var(--warning-strong)",
  High: "var(--danger-strong)",
  Critical: "var(--danger-deep)",
};

const taskTypeWeight = {
  assignment: 1.2,
  test: 1.5,
  exam: 1.8,
  ca: 1,
};

const upcomingTasks = [...taskData].sort((a, b) => new Date(a.due) - new Date(b.due));

const workload = (() => {
  let total = 0;
  for (const task of taskData) {
    const daysLeft = daysUntil(task.due);
    const urgency = daysLeft <= 0 ? 1.7 : daysLeft <= 2 ? 1.4 : daysLeft <= 5 ? 1.15 : 0.8;
    const effort = task.completed ? 0 : task.effort * taskTypeWeight[task.type] * urgency;
    total += effort;
  }

  const score = Math.min(100, Math.round(total * 11));
  if (score < 35) return { score, label: "Low" };
  if (score < 60) return { score, label: "Medium" };
  if (score < 80) return { score, label: "High" };
  return { score, label: "Critical" };
})();

const warningMessages = [
  "Two major deadlines cluster within 48 hours, so your revision blocks should prioritise algorithms and biology.",
  "Current study capacity covers 6.5 hours before the next critical deadline; keep a 30-minute buffer for review.",
  "Your workload has been elevated by 18% since last week because of outstanding assessment preparation.",
];

function getStatus(task) {
  const daysLeft = daysUntil(task.due);
  if (task.completed) return { label: "Completed", tone: "success" };
  if (daysLeft < 0) return { label: "Overdue", tone: "danger" };
  if (daysLeft <= 2) return { label: "Urgent", tone: "warning" };
  return { label: "Upcoming", tone: "neutral" };
}

function Home() {
  return (
    <div className="page-shell">
      <div className="content-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">L</div>
            <div>
              <p className="eyebrow">Academic OS</p>
              <h2>LoadWise</h2>
            </div>
          </div>

          <nav className="nav-stack" aria-label="Sidebar navigation">
            <button className="nav-item active" type="button">
              Overview
            </button>
            <button className="nav-item" type="button">
              Courses
            </button>
            <button className="nav-item" type="button">
              Tasks
            </button>
            <button className="nav-item" type="button">
              Planner
            </button>
            <button className="nav-item" type="button">
              Reports
            </button>
          </nav>

          <div className="promo-card">
            <p className="eyebrow">Study rhythm</p>
            <h3>6.5 hrs</h3>
            <p>Available this week after lectures and labs.</p>
          </div>
        </aside>

        <main className="main-panel">
          <header className="topbar">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h1>Student workload overview</h1>
            </div>

            <div className="topbar-actions">
              <button className="ghost-button" type="button">
                Export plan
              </button>
              <button className="primary-button" type="button">
                Add task
              </button>
            </div>
          </header>

          <section className="summary-grid">
            <article className="card load-card">
              <div className="load-card-header">
                <div>
                  <p className="eyebrow">Academic load score</p>
                  <h3>{workload.score}/100</h3>
                </div>
                <span className="pill" style={{ background: "var(--surface-soft)", color: severityTone[workload.label] }}>
                  {workload.label}
                </span>
              </div>

              <div
                className="score-ring"
                aria-label="Academic load score"
                style={{ background: `conic-gradient(var(--primary) 0 ${workload.score}%, #dfe6ee ${workload.score}% 100%)` }}
              >
                <div className="score-ring-inner">
                  <strong>{workload.score}</strong>
                </div>
              </div>

              <p className="muted-copy">
                Deadline pressure is elevated because two courses have assessments inside the next 48 hours and one assignment is already overdue.
              </p>
            </article>

            <article className="card stat-card">
              <p className="eyebrow">Urgent tasks</p>
              <h3>3</h3>
              <p>Across algorithms, biology, and history.</p>
            </article>

            <article className="card stat-card">
              <p className="eyebrow">Due this week</p>
              <h3>8</h3>
              <p>Including lab work and coursework revisions.</p>
            </article>

            <article className="card stat-card">
              <p className="eyebrow">Study completion</p>
              <h3>68%</h3>
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: "68%" }} />
              </div>
              <p>3 of 5 planned study sessions completed.</p>
            </article>
          </section>

          <section className="content-grid">
            <article className="card full-width">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Priority tasks</p>
                  <h2>Upcoming deadlines</h2>
                </div>
                <button className="text-button" type="button">
                  View all
                </button>
              </div>

              <div className="task-list" role="list">
                {upcomingTasks.map((task) => {
                  const status = getStatus(task);
                  const remaining = daysUntil(task.due);

                  return (
                    <div key={task.id} className="task-row" role="listitem">
                      <div className="task-meta">
                        <div className="task-badge">{task.course}</div>
                        <div>
                          <h4>{task.title}</h4>
                          <p>{task.type.toUpperCase()} • {task.notable}</p>
                        </div>
                      </div>

                      <div className="task-side">
                        <span className={`status-pill ${status.tone}`}>
                          {status.label}
                        </span>
                        <div className="date-block">
                          <strong>{remaining < 0 ? `${Math.abs(remaining)}d late` : `${remaining}d left`}</strong>
                          <span>{formatDate(task.due)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="card">
              <div className="panel-header compact">
                <div>
                  <p className="eyebrow">Course load</p>
                  <h2>Distribution</h2>
                </div>
              </div>

              <div className="course-list">
                {courseData.map((course) => (
                  <div key={course.id} className="course-row">
                    <div className="course-label">
                      <strong>{course.code}</strong>
                      <span>{course.title}</span>
                    </div>
                    <div className="course-meter">
                      <span style={{ width: `${course.workload}%` }} />
                    </div>
                    <div className="course-footer">
                      <span>{course.tasks} tasks</span>
                      <span>{course.hours}h project time</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="panel-header compact">
                <div>
                  <p className="eyebrow">Early warnings</p>
                  <h2>Action required</h2>
                </div>
              </div>

              <div className="warning-list">
                {warningMessages.map((message) => (
                  <div key={message} className="warning-item">
                    <span className="warning-dot" aria-hidden="true" />
                    <p>{message}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="card full-width planner-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Study planner</p>
                  <h2>Recommended sessions</h2>
                </div>
                <button className="text-button" type="button">
                  Regenerate
                </button>
              </div>

              <div className="planner-grid">
                {plannerSlots.map((slot) => (
                  <div key={`${slot.day}-${slot.title}`} className="planner-item">
                    <div className="planner-day">{slot.day}</div>
                    <h4>{slot.title}</h4>
                    <p>{slot.time}</p>
                    <div className="planner-footer">
                      <span>{slot.duration} min</span>
                      <span className="mini-pill">{slot.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

export default Home;

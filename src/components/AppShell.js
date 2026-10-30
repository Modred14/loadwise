"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BookOpen, CalendarDays, CheckSquare, ClipboardList, FolderOpen, Gauge, Landmark, LayoutDashboard, LogOut, MoreHorizontal, Settings, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/store";
import { Banner, Button, Dialog, cx } from "@/components/ui";
import { Logo, LogoMark } from "@/components/brand";
import { LoadRail } from "@/components/viz";

export { Logo };

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/planner", label: "Planner", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/materials", label: "Materials", icon: FolderOpen },
  { href: "/insights", label: "Insights", icon: Gauge },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
// Shown only to people it applies to: members of a department, and department administrators.
const SHARED_NAV = { href: "/shared-dates", label: "Shared dates", icon: Users };
const DEPT_NAV = { href: "/department", label: "Department", icon: Landmark };
const navFor = (user) => {
  const items = [...NAV];
  const at = items.findIndex((n) => n.href === "/insights");
  const extra = [user?.departmentId ? SHARED_NAV : null, user?.role === "dept_admin" && user?.departmentId ? DEPT_NAV : null].filter(Boolean);
  items.splice(at + 1, 0, ...extra);
  return items;
};
const PRIMARY_MOBILE = NAV.slice(0, 4);
const isActive = (pathname, href) => pathname === href || pathname.startsWith(href + "/");

function NavLink({ item, count, compact }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? cx("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors", active ? "text-ink" : "text-muted")
          : cx("flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors", active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")
      }
    >
      {compact ? <span className={cx("absolute top-0 h-0.5 w-8 bg-ink transition-transform duration-200", active ? "scale-x-100" : "scale-x-0")} aria-hidden /> : null}
      <Icon size={compact ? 21 : 18} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
      <span>{item.label}</span>
      {count > 0 ? (
        <span className={compact ? "absolute top-2 right-[26%] size-2 bg-crit" : "tnum ml-auto bg-crit px-1.5 font-mono text-[0.6875rem] leading-5 text-white"} aria-label={`${count} active`}>
          {compact ? null : count}
        </span>
      ) : null}
    </Link>
  );
}

/** Permanent live readout: the one number that matters, visible from every screen. */
function LoadReadout({ workload }) {
  if (!workload) return null;
  return (
    <Link href="/insights" className="panel group mx-1 mb-4 block rounded-lg border border-line-strong p-3.5 transition-transform hover:-translate-y-px" aria-label={`Workload ${workload.score} of 100, ${workload.categoryLabel}. Open insights.`}>
      <div className="flex items-end justify-between">
        <span className="t-num tnum text-[2.75rem]">{workload.score}</span>
        <span className="pb-1 text-right">
          <span className="t-label block">Current load</span>
          <span className="text-xs font-semibold">{workload.categoryLabel}</span>
        </span>
      </div>
      <LoadRail score={workload.score} labels={false} ticks={50} height="1.25rem" className="mt-3" />
    </Link>
  );
}

export default function AppShell({ children }) {
  const { status, user, logout, error } = useAuth();
  const router = useRouter();
  const data = useData();
  const [more, setMore] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status === "unconfigured") {
    return (
      <main id="main" className="mx-auto w-full max-w-xl p-6">
        <Logo />
        <div className="mt-6">
          <Banner tone="warning" title="Backend not connected">
            LoadWise needs its API. Set <code className="font-mono">NEXT_PUBLIC_API_BASE_URL</code> to the backend URL and restart. No data is shown until then, and nothing is stored locally.
          </Banner>
        </div>
      </main>
    );
  }
  if (status === "error") {
    return (
      <main id="main" className="mx-auto w-full max-w-xl p-6">
        <Logo />
        <div className="mt-6"><Banner title="Could not reach the server" action={<Button variant="secondary" onClick={() => location.reload()}>Retry</Button>}>{error}</Banner></div>
      </main>
    );
  }
  if (status !== "authenticated") {
    return (
      <div role="status" className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <LogoMark size={44} className="anim-pulse" />
        <p className="t-label">Checking your session</p>
      </div>
    );
  }

  const nav = navFor(user);
  const unread = (data?.warningsShown ?? []).filter((w) => w.severity !== "info" && !w.readAt).length + (data?.notifications ?? []).filter((n) => !n.readAt).length;
  const countFor = (href) => (href === "/notifications" ? unread : 0);
  const moreItems = nav.slice(PRIMARY_MOBILE.length);
  const activeIndex = nav.findIndex((n) => isActive(pathname, n.href));
  const workload = data?.workload;

  const signOut = async () => {
    setSigningOut(true);
    try { await logout(); router.replace("/login"); } finally { setSigningOut(false); }
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-3 pt-3 pb-3 lg:flex print:hidden">
        <div className="px-2 pb-3"><Logo /></div>
        <LoadReadout workload={workload} />
        <nav aria-label="Main" className="relative flex flex-1 flex-col gap-0.5">
          {activeIndex >= 0 ? <span className="absolute top-0 left-0 z-10 h-10 w-[3px] bg-primary transition-transform duration-300 ease-(--ease)" style={{ transform: `translateY(calc(${activeIndex} * 2.625rem))` }} aria-hidden /> : null}
          {nav.map((n) => <NavLink key={n.href} item={n} count={countFor(n.href)} />)}
        </nav>
        <div className="border-t border-line pt-3">
          <div className="flex items-center gap-3 px-2 pb-2">
            <span className="flex size-9 shrink-0 items-center justify-center bg-ink font-display text-lg text-white" aria-hidden>{(user?.name ?? "S").trim()[0]?.toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{user?.name ?? "Student"}</p><p className="t-small truncate">{user?.email}</p></div>
          </div>
          <Button variant="ghost" icon={LogOut} loading={signingOut} onClick={signOut} className="w-full justify-start text-muted">Log out</Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-sm lg:hidden print:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            {workload ? (
              <Link href="/insights" aria-label={`Workload ${workload.score} of 100, ${workload.categoryLabel}`} className="panel flex h-11 items-center gap-2 rounded-md border border-line-strong px-3">
                <span className="size-2" style={{ background: `var(--zone-${workload.category})` }} aria-hidden />
                <span className="tnum font-mono text-sm font-medium">{workload.score}</span>
              </Link>
            ) : null}
            <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} active` : ""}`} className="relative flex size-11 items-center justify-center rounded-md hover:bg-surface-2">
              <Bell size={20} aria-hidden />
              {unread > 0 ? <span className="absolute top-2.5 right-2.5 size-2 bg-crit" /> : null}
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} key={pathname} className="anim-page mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 2xl:max-w-[88rem] outline-none lg:px-10 lg:py-10 lg:pb-12 print:p-0">
          {data?.status === "error" ? (
            <div className="mb-4"><Banner title="Some data could not be loaded" action={<Button variant="secondary" onClick={data.reload}>Retry</Button>}>{data.error}</Banner></div>
          ) : null}
          {children}
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
        {PRIMARY_MOBILE.map((n) => <NavLink key={n.href} item={n} count={0} compact />)}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" className={cx("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreItems.some((n) => isActive(pathname, n.href)) ? "text-ink" : "text-muted")}>
          <span className={cx("absolute top-0 h-0.5 w-8 bg-ink transition-transform duration-200", moreItems.some((n) => isActive(pathname, n.href)) ? "scale-x-100" : "scale-x-0")} aria-hidden />
          <MoreHorizontal size={21} aria-hidden /> More
          {unread > 0 ? <span className="absolute top-2 right-[26%] size-2 bg-crit" aria-label={`${unread} active warnings`} /> : null}
        </button>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="grid grid-cols-2 gap-2">
          {moreItems.map((n) => {
            const Icon = n.icon;
            const c = countFor(n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setMore(false)} aria-current={isActive(pathname, n.href) ? "page" : undefined} className={cx("flex min-h-16 flex-col justify-between rounded-md border p-3 text-sm font-medium", isActive(pathname, n.href) ? "border-ink bg-surface-2" : "border-line hover:bg-surface-2")}>
                  <span className="flex items-center justify-between"><Icon size={20} aria-hidden />{c > 0 ? <span className="tnum bg-crit px-1.5 font-mono text-xs text-white">{c}</span> : null}</span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <span className="flex size-10 shrink-0 items-center justify-center bg-ink font-display text-xl text-white" aria-hidden>{(user?.name ?? "S").trim()[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.name ?? "Student"}</p><p className="t-small truncate">{user?.email}</p></div>
          <Button variant="secondary" icon={LogOut} loading={signingOut} onClick={signOut}>Log out</Button>
        </div>
      </Dialog>
    </div>
  );
}

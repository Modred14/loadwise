"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BookOpen, CalendarDays, CheckSquare, ClipboardList, Gauge, LayoutDashboard, LogOut, MoreHorizontal, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/store";
import { Banner, Button, Dialog, Spinner } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/planner", label: "Planner", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: Gauge },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
const PRIMARY_MOBILE = NAV.slice(0, 4);

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold text-primary">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-white" aria-hidden>
        <Gauge size={16} />
      </span>
      LoadWise
    </Link>
  );
}

function NavLink({ item, count, compact }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${active ? "text-primary" : "text-muted"}`
          : `flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-ink"}`
      }
    >
      <Icon size={compact ? 20 : 18} aria-hidden />
      <span>{item.label}</span>
      {count > 0 ? (
        <span className={compact ? "absolute top-1.5 right-[28%] size-2 rounded-full bg-crit" : "ml-auto rounded bg-crit px-1.5 text-xs text-white tnum"} aria-label={`${count} active`}>
          {compact ? null : count}
        </span>
      ) : null}
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
      <main className="mx-auto w-full max-w-xl p-6">
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
      <main className="mx-auto w-full max-w-xl p-6">
        <Logo />
        <div className="mt-6"><Banner title="Could not reach the server" action={<Button variant="secondary" onClick={() => location.reload()}>Retry</Button>}>{error}</Banner></div>
      </main>
    );
  }
  if (status !== "authenticated") return <Spinner label="Checking your session" />;

  const unread = (data?.warningsShown ?? []).filter((w) => w.severity !== "info" && !w.readAt).length;
  const countFor = (href) => (href === "/notifications" ? unread : 0);
  const moreItems = NAV.slice(4);

  const signOut = async () => {
    setSigningOut(true);
    try { await logout(); router.replace("/login"); } finally { setSigningOut(false); }
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-3 lg:flex print:hidden">
        <div className="px-2 py-3"><Logo /></div>
        <nav aria-label="Main" className="mt-2 flex flex-1 flex-col gap-0.5">
          {NAV.map((n) => <NavLink key={n.href} item={n} count={countFor(n.href)} />)}
        </nav>
        <div className="border-t border-line pt-3">
          <p className="truncate px-2 text-sm font-medium">{user?.name ?? "Student"}</p>
          <p className="truncate px-2 pb-2 t-small">{user?.email}</p>
          <Button variant="ghost" icon={LogOut} loading={signingOut} onClick={signOut} className="w-full justify-start">Log out</Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 pt-[env(safe-area-inset-top)] lg:hidden print:hidden">
          <Logo />
          <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} active` : ""}`} className="relative flex size-11 items-center justify-center rounded-md hover:bg-surface-2">
            <Bell size={20} aria-hidden />
            {unread > 0 ? <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-crit" /> : null}
          </Link>
        </header>
        <main key={pathname} className="anim-page mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8 print:p-0">
          {data?.status === "error" ? (
            <div className="mb-4"><Banner title="Some data could not be loaded" action={<Button variant="secondary" onClick={data.reload}>Retry</Button>}>{data.error}</Banner></div>
          ) : null}
          {children}
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
        {PRIMARY_MOBILE.map((n) => <NavLink key={n.href} item={n} count={0} compact />)}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
          <MoreHorizontal size={20} aria-hidden /> More
        </button>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="flex flex-col">
          {moreItems.map((n) => {
            const Icon = n.icon;
            return (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setMore(false)} className="flex min-h-12 items-center gap-3 rounded-md px-2 text-base hover:bg-surface-2">
                  <Icon size={20} aria-hidden /> {n.label}
                  {countFor(n.href) > 0 ? <span className="ml-auto rounded bg-crit px-1.5 text-xs text-white">{countFor(n.href)}</span> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={signOut} className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-base hover:bg-surface-2">
              <LogOut size={20} aria-hidden /> Log out
            </button>
          </li>
        </ul>
      </Dialog>
    </div>
  );
}

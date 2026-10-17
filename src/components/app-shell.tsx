"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  IconBell,
  IconBox,
  IconChart,
  IconClipboard,
  IconGauge,
  IconLayers,
  IconLogout,
  IconMenu,
  IconPlus,
  IconReceipt,
  IconUsers,
  IconWallet,
} from "@/components/icons";
import { Avatar, Badge, Sheet } from "@/components/ui";
import { useResource } from "@/lib/client";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  hint: string;
  badge?: "requisitions" | "inventory";
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconGauge, hint: "Today at a glance" },
  { href: "/inventory", label: "Inventory", icon: IconBox, hint: "Catalogue & stock levels" },
  { href: "/sales", label: "Sales", icon: IconReceipt, hint: "Invoices & collections" },
  { href: "/requisitions", label: "Requisitions", icon: IconClipboard, hint: "Approve & restock" },
  { href: "/expenses", label: "Expenses", icon: IconWallet, hint: "Route & operating costs" },
  { href: "/reports", label: "Reports", icon: IconChart, hint: "Stock & margin analysis" },
  { href: "/customers", label: "Customers", icon: IconUsers, hint: "Accounts & balances" },
];

const MOBILE_PRIMARY = ["/dashboard", "/inventory", "/sales", "/requisitions"];

function useDash() {
  const { data } = useResource<{
    stock: { low: number; out: number };
    pendingRequisitions: number;
    today: { revenue: number; orders: number };
  }>("dash", "/api/dashboard");
  return data;
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string; initials: string; hue: number; territory: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dash = useDash();
  const [drawer, setDrawer] = useState(false);
  const [more, setMore] = useState(false);

  // Close transient overlays whenever the route changes (derived during render).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
    setMore(false);
  }

  const badgeCount = (item: NavItem) => {
    if (!dash) return 0;
    if (item.badge === "requisitions") return dash.pendingRequisitions;
    if (item.badge === "inventory") return dash.stock.low + dash.stock.out;
    return 0;
  };

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link href="/dashboard" className="group flex items-center gap-2.5 rounded-xl px-1 py-1">
        <span className="relative grid size-9 place-items-center rounded-[11px] bg-bright/90 text-pine-2 shadow-[0_10px_20px_-12px_rgba(31,169,124,0.9)] transition group-hover:rotate-[-6deg]">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
            <path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4v-9Z" />
            <path d="M8.5 12.5h7" />
          </svg>
        </span>
        <span>
          <span className="vf-display block text-[15.5px] font-bold leading-none tracking-tight">VendFlow</span>
          <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-bright">
            Field Ops
          </span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const count = badgeCount(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-semibold transition ${
                active ? "bg-white/12 text-white" : "text-white/62 hover:bg-white/6 hover:text-white"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r-full bg-bright transition-all duration-300 ${
                  active ? "h-6" : "group-hover:h-2"
                }`}
              />
              <Icon className={`size-[18px] transition ${active ? "text-bright" : "text-white/55 group-hover:text-white"}`} />
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 ? (
                <span className="vf-num rounded-full bg-amber/90 px-1.5 py-0.5 text-[10.5px] font-bold text-[#2b1d05]">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-[14px] border border-white/10 bg-white/6 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/55">Today</p>
            <span className="vf-live-dot size-2 rounded-full bg-bright" />
          </div>
          <p className="vf-num mt-1.5 text-[19px] font-bold text-white">
            ${((dash?.today.revenue ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11.5px] text-white/55">{dash?.today.orders ?? 0} orders closed · {user.territory}</p>
        </div>
        <div className="flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/6 p-2.5">
          <Avatar initials={user.initials} hue={user.hue} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11px] capitalize text-white/50">{user.role} · {user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="vf-press grid size-8 place-items-center rounded-[10px] text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <IconLogout className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="vf-canvas min-h-dvh lg:pl-[268px]">
      {/* Desktop rail */}
      <aside className="vf-panel-dark fixed inset-y-0 left-0 z-40 hidden w-[268px] border-r border-white/8 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      <Sheet open={drawer} onClose={() => setDrawer(false)} title="VendFlow" size="sm">
        <div className="vf-panel-dark -mx-1 -my-2 rounded-[16px]">{sidebar}</div>
      </Sheet>

      {/* Top bar */}
      <div className="no-print sticky top-0 z-30 border-b border-hairline/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2 px-3 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            className="vf-press grid size-9 place-items-center rounded-[11px] border border-hairline bg-surface text-ink-2 lg:hidden"
          >
            <IconMenu className="size-[18px]" />
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <Badge tone="good" dot>
              Live
            </Badge>
            <span className="text-[12.5px] text-muted">
              {dash ? `${dash.stock.low + dash.stock.out} SKUs need attention` : "Syncing inventory…"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/sales?new=1"
              className="vf-press hidden items-center gap-1.5 rounded-[11px] bg-pine px-3 py-2 text-[13px] font-semibold text-paper transition hover:bg-pine-2 sm:inline-flex"
            >
              <IconPlus className="size-4" />
              New sale
            </Link>
            <button
              type="button"
              onClick={() => router.push("/requisitions")}
              className="vf-press relative grid size-9 place-items-center rounded-[11px] border border-hairline bg-surface text-ink-2 transition hover:text-ink"
              aria-label="Open alerts"
            >
              <IconBell className="size-[18px]" />
              {(dash?.pendingRequisitions ?? 0) > 0 ? (
                <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-clay px-1 text-[10px] font-bold text-white">
                  {dash?.pendingRequisitions}
                </span>
              ) : null}
            </button>
            <Link href="/customers" className="hidden sm:block">
              <Avatar initials={user.initials} hue={user.hue} size={36} />
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1180px] px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 print:pb-0 sm:px-6 lg:pb-14">{children}</main>

      {/* Mobile tab bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-[520px] items-stretch justify-between px-2 py-1.5">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`vf-press relative flex flex-1 flex-col items-center gap-0.5 rounded-[12px] py-1.5 text-[10.5px] font-bold transition ${
                  active ? "text-pine" : "text-muted"
                }`}
              >
                <Icon className={`size-[19px] ${active ? "text-bright" : ""}`} />
                {item.label === "Dashboard" ? "Home" : item.label}
                {badgeCount(item) > 0 ? (
                  <span className="absolute right-3 top-0.5 size-1.5 rounded-full bg-clay" />
                ) : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMore(true)}
            className={`vf-press flex flex-1 flex-col items-center gap-0.5 rounded-[12px] py-1.5 text-[10.5px] font-bold transition ${
              NAV.some((n) => !MOBILE_PRIMARY.includes(n.href) && pathname.startsWith(n.href))
                ? "text-pine"
                : "text-muted"
            }`}
          >
            <IconLayers className="size-[19px]" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More tools" description="Money, analysis and accounts">
        <div className="grid gap-2">
          {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMore(false)}
                className="vf-press flex items-center gap-3 rounded-[14px] border border-hairline bg-paper p-3 transition hover:border-ink/20 hover:bg-surface"
              >
                <span className="grid size-10 place-items-center rounded-[12px] bg-pine text-paper">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink">{item.label}</span>
                  <span className="block truncate text-[12px] text-muted">{item.hint}</span>
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="vf-press mt-1 flex items-center justify-center gap-2 rounded-[14px] border border-clay/25 bg-clay-soft/50 p-3 text-[13.5px] font-semibold text-clay"
          >
            <IconLogout className="size-4" />
            Sign out of VendFlow
          </button>
        </div>
      </Sheet>
    </div>
  );
}

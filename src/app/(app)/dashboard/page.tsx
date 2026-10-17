"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Donut, TrendChart } from "@/components/charts";
import {
  IconAlert,
  IconArrowUp,
  IconBox,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconWallet,
} from "@/components/icons";
import { Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, PageHeader, SectionTitle, Skeleton, StatSkeleton } from "@/components/ui";
import { StatTile } from "@/components/stat-tile";
import { invalidate, useResource } from "@/lib/client";
import { centsToUsd, formatDate, formatNumber, pct, relativeTime, usdCompact } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

const CATEGORY_COLORS = ["#12433a", "#1fa97c", "#e9a23b", "#2e6fa7", "#6f4b8f", "#c4453b"];

const PAYMENT_COLORS: Record<string, string> = {
  cash: "#1fa97c",
  card: "#2e6fa7",
  transfer: "#12433a",
  credit: "#e9a23b",
};

const MOVEMENT_TONE: Record<string, string> = {
  sale: "text-clay",
  receipt: "text-pine",
  return: "text-steel",
  adjustment: "text-amber",
  requisition: "text-plum",
  damage: "text-clay",
};

export default function DashboardPage() {
  const { data, loading, error, refetch } = useResource<DashboardData>("dash", "/api/dashboard");
  const [greeting, setGreeting] = useState("Welcome back");
  const [mix, setMix] = useState<"payments" | "categories">("payments");
  const [today, setToday] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Client-localised copy: applied on the first frame after hydration.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const now = new Date();
      const hour = now.getHours();
      setGreeting(hour < 12 ? "Morning report" : hour < 17 ? "Midday pulse" : "End-of-day wrap");
      setToday(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function sync() {
    setRefreshing(true);
    invalidate("dash");
    await refetch();
    setTimeout(() => setRefreshing(false), 450);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Dashboard" subtitle="Live view of today's trade" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  const d = data;
  const revenueDelta = d && d.today.revenue + d.today.deltaRevenue > 0
    ? pct(d.today.deltaRevenue, d.today.revenue + d.today.deltaRevenue)
    : 0;
  const monthProgress = d && d.month.prevRevenue > 0 ? Math.min(140, pct(d.month.revenue, d.month.prevRevenue)) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={greeting}
        subtitle={today || "Syncing…"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={sync} icon={<IconRefresh className={`size-4 ${refreshing ? "animate-spin" : ""}`} />}>
              Sync
            </Button>
            <Link href="/sales?new=1" className="vf-press inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-pine px-3 text-[12.5px] font-semibold text-paper hover:bg-pine-2">
              <IconPlus className="size-4" />
              New sale
            </Link>
          </>
        }
      />

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading || !d ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatTile
              label="Revenue today"
              value={centsToUsd(d.today.revenue)}
              delta={revenueDelta}
              deltaLabel="vs yesterday"
              tone="pine"
              spark={d.series.map((s) => s.revenue)}
              icon={<IconCash className="size-4" />}
              footer={`${formatNumber(d.today.completedOrders)} invoices settled`}
            />
            <StatTile
              label="Gross margin"
              value={`${d.today.marginPct.toFixed(1)}%`}
              tone="steel"
              icon={<IconArrowUp className="size-4" />}
              deltaLabel="today"
              delta={d.today.marginPct - (d.month.marginPct || 0)}
              footer={`${centsToUsd(d.today.grossProfit)} profit on ${centsToUsd(d.today.cost)} cost`}
            />
            <StatTile
              label="Avg basket"
              value={centsToUsd(d.today.avgBasket)}
              tone="amber"
              icon={<IconReceipt className="size-4" />}
              footer={`${formatNumber(d.today.units)} units moved today`}
            />
            <StatTile
              label="Cash after costs"
              value={centsToUsd(d.today.netCash)}
              tone="clay"
              icon={<IconWallet className="size-4" />}
              footer={`${centsToUsd(d.today.expenses)} logged in expenses`}
            />
          </>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Last 14 days"
            title="Revenue vs cost of trade"
            hint="Bars show settled revenue; amber shows expenses"
            right={
              d ? (
                <div className="hidden text-right sm:block">
                  <p className="vf-num text-[18px] font-bold text-pine">{usdCompact(d.series.reduce((s, x) => s + x.revenue, 0))}</p>
                  <p className="text-[11px] text-muted">14-day revenue</p>
                </div>
              ) : null
            }
          />
          <div className="mt-4">
            {loading || !d ? (
              <Skeleton className="h-[168px] w-full" />
            ) : (
              <TrendChart points={d.series.map((s) => ({ date: s.date, revenue: s.revenue, orders: s.orders, expenses: s.expenses }))} />
            )}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Collections"
            title={mix === "payments" ? "Payment mix" : "Category mix"}
            hint={mix === "payments" ? "Last 30 days by tender" : "Revenue by product family, 14 days"}
            right={
              <div className="vf-scroll-hide flex gap-1 rounded-full border border-hairline bg-paper p-0.5">
                {(["payments", "categories"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMix(m)}
                    className={`vf-press rounded-full px-2.5 py-1 text-[11.5px] font-bold capitalize transition ${mix === m ? "bg-surface text-pine shadow-sm" : "text-muted"}`}
                  >
                    {m === "payments" ? "Tender" : "Range"}
                  </button>
                ))}
              </div>
            }
          />
          <div className="mt-4">
            {loading || !d ? (
              <div className="flex items-center gap-5">
                <Skeleton className="size-[132px] rounded-full" />
                <div className="flex-1 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-3.5 w-full" />
                  ))}
                </div>
              </div>
            ) : (mix === "payments" ? d.payments : d.categories).length ? (
              <Donut
                slices={
                  mix === "payments"
                    ? d.payments.map((p) => ({ label: p.label, value: p.value, color: PAYMENT_COLORS[p.label] ?? "#12433a" }))
                    : d.categories.map((c, i) => ({ label: c.label, value: c.value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
                }
                caption={mix === "payments" ? "30d settled" : "14d revenue"}
              />
            ) : (
              <EmptyState title="No tenders recorded" description="Payments will break down here once the first invoice is settled today." />
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_1fr_0.9fr]">
        {/* Stock alerts */}
        <Card className="flex flex-col p-4 sm:p-5">
          <SectionTitle
            eyebrow="Replenishment"
            title="Stock alerts"
            right={d ? <Badge tone={d.stock.out ? "bad" : d.stock.low ? "warn" : "good"}>{d.stock.low + d.stock.out} SKUs</Badge> : null}
          />
          <div className="mt-3 flex-1">
            {loading || !d ? (
              <ListSkeleton rows={4} />
            ) : d.lowStock.length ? (
              <ul className="space-y-2">
                {d.lowStock.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/inventory?focus=${p.id}`}
                      className="vf-press group flex items-center gap-3 rounded-[13px] border border-hairline bg-paper/60 p-2.5 transition hover:border-bright/40 hover:bg-bright-soft/40"
                    >
                      <span className={`grid size-9 shrink-0 place-items-center rounded-[11px] ${p.stock <= 0 ? "bg-clay-soft text-clay" : "bg-amber-soft text-[#8a5a11]"}`}>
                        <IconAlert className="size-[17px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                        <span className="block text-[11.5px] text-muted">
                          {p.stock} {p.unit} left · reorder at {p.reorderLevel} · {p.bin}
                        </span>
                      </span>
                      <IconChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-pine" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<IconCheck className="size-6" />}
                title="Every SKU is above its reorder point"
                description="Nothing needs chasing right now. Requisitions still flow in from the warehouse."
                action={
                  <Button size="sm" variant="outline" onClick={refetch} icon={<IconRefresh className="size-4" />}>
                    Recheck
                  </Button>
                }
              />
            )}
          </div>
          <Link
            href="/requisitions"
            className="mt-3 flex items-center justify-between rounded-[12px] bg-pine/6 px-3 py-2.5 text-[13px] font-semibold text-pine transition hover:bg-pine/10"
          >
            <span className="flex items-center gap-2">
              <IconBox className="size-4" />
              {d?.pendingRequisitions ?? 0} requisitions awaiting approval
            </span>
            <IconChevronRight className="size-4" />
          </Link>
        </Card>

        {/* Recent sales */}
        <Card className="p-4 sm:p-5">
          <SectionTitle
            eyebrow="Activity"
            title="Latest invoices"
            right={
              <Link href="/sales" className="text-[12.5px] font-semibold text-pine underline decoration-bright/40 underline-offset-4">
                All sales
              </Link>
            }
          />
          <div className="mt-3">
            {loading || !d ? (
              <ListSkeleton rows={5} />
            ) : d.recentSales.length ? (
              <ul className="divide-y divide-hairline/70">
                {d.recentSales.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sales/${s.id}`} className="vf-press -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-paper">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-ink">{s.customerName}</span>
                          <Badge tone={s.status === "completed" ? "good" : s.status === "pending" ? "warn" : "bad"}>{s.status}</Badge>
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                          {s.invoiceNo} · {s.itemCount} lines · {s.soldByName.split(" ")[0]} · {relativeTime(s.createdAt)}
                        </span>
                      </span>
                      <span className="vf-num shrink-0 text-[13.5px] font-bold text-ink">{centsToUsd(s.totalCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No invoices yet" description="Create your first sale and it will appear here instantly." action={<Link href="/sales?new=1"><Button size="sm">New sale</Button></Link>} />
            )}
          </div>
        </Card>

        {/* Month target + movements */}
        <Card className="flex flex-col p-4 sm:p-5">
          <SectionTitle eyebrow="Trajectory" title="Month vs last month" />
          {loading || !d ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : (
            <>
              <p className="vf-num mt-3 text-[24px] font-bold text-ink">{centsToUsd(d.month.revenue)}</p>
              <p className="text-[12px] text-muted">
                against {usdCompact(d.month.prevRevenue)} last month
              </p>
              <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-paper-2">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bright to-pine transition-[width] duration-1000 ease-out"
                  style={{ width: `${Math.max(4, Math.min(100, monthProgress))}%` }}
                />
              </div>
              <p className="mt-1.5 flex items-center justify-between text-[11.5px] font-semibold text-muted">
                <span>{monthProgress.toFixed(0)}% of last month</span>
                <span className={monthProgress >= 100 ? "text-pine" : "text-amber"}>
                  {monthProgress >= 100 ? "Ahead of pace" : "Behind pace"}
                </span>
              </p>

              <div className="mt-4 border-t border-hairline pt-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  <IconClock className="size-3.5" /> Stock ledger
                </p>
                <ul className="mt-2 space-y-1.5">
                  {d.movements.slice(0, 5).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-[12.5px]">
                      <span className={`vf-num w-9 shrink-0 font-bold ${MOVEMENT_TONE[m.type] ?? "text-ink-2"}`}>
                        {m.qtyChange > 0 ? `+${m.qtyChange}` : m.qtyChange}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">{m.productName}</span>
                      <span className="shrink-0 text-[11px] capitalize text-muted">{m.type}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}

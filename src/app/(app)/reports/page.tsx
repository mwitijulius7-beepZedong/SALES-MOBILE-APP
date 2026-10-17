"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconAlert, IconArrowDown, IconArrowUp, IconBox, IconChart, IconDownload, IconSearch } from "@/components/icons";
import { RankBars, TrendChart } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
} from "@/components/ui";
import { StatTile } from "@/components/stat-tile";
import { useToast } from "@/components/toast";
import { useDebounced, useResource } from "@/lib/client";
import { centsToUsd, formatDate, formatNumber, isoDaysAgo, pct, todayISO, usdCompact } from "@/lib/format";
import type { ReportData } from "@/lib/types";

const PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30" },
  { value: "90", label: "Quarter" },
  { value: "180", label: "6 months" },
  { value: "custom", label: "Custom" },
] as const;

export default function ReportsPage() {
  const toast = useToast();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["value"]>("30");
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(todayISO());
  const [sort, setSort] = useState<"value" | "stock" | "potential" | "name">("value");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [rawQuery, setRawQuery] = useState("");
  const query = useDebounced(rawQuery.trim().toLowerCase());

  const { data, loading, error, refetch } = useResource<ReportData>(`reports:${from}:${to}`, `/api/reports?from=${from}&to=${to}`);

  function applyPreset(next: (typeof PRESETS)[number]["value"]) {
    setPreset(next);
    if (next !== "custom") {
      const days = Number(next);
      setFrom(isoDaysAgo(days - 1));
      setTo(todayISO());
    }
  }

  const stock = useMemo(() => {
    let rows = data?.stock ?? [];
    if (onlyIssues) rows = rows.filter((r) => r.status !== "healthy");
    if (query) rows = rows.filter((r) => `${r.name} ${r.sku} ${r.category} ${r.supplier}`.toLowerCase().includes(query));
    const sorted = [...rows];
    if (sort === "value") sorted.sort((a, b) => b.costValue - a.costValue);
    if (sort === "potential") sorted.sort((a, b) => b.potential - a.potential);
    if (sort === "stock") sorted.sort((a, b) => a.stock - b.stock);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [data, onlyIssues, query, sort]);

  const totals = data?.totals;
  const stockValue = (data?.stock ?? []).reduce((s, r) => s + r.costValue, 0);
  const stockRetail = (data?.stock ?? []).reduce((s, r) => s + r.retailValue, 0);
  const issues = (data?.stock ?? []).filter((r) => r.status !== "healthy");

  function exportCsv() {
    if (!data) return;
    const header = ["sku", "name", "category", "stock", "reorder", "cost_value_usd", "retail_value_usd", "potential_usd", "status", "bin", "supplier"];
    const lines = stock.map((r) =>
      [r.sku, `"${r.name}"`, `"${r.category}"`, r.stock, r.reorderLevel, (r.costValue / 100).toFixed(2), (r.retailValue / 100).toFixed(2), (r.potential / 100).toFixed(2), r.status, r.bin, `"${r.supplier}"`].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendflow-stock-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push({ title: "Stock report exported", description: `${lines.length} rows written to CSV.` });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock & sales reports"
        subtitle={`${formatDate(from)} → ${formatDate(to)} · everything derives from live ledgers`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()} icon={<IconChart className="size-4" />}>
              Print
            </Button>
            <Button size="sm" onClick={exportCsv} icon={<IconDownload className="size-4" />} disabled={!data}>
              Export CSV
            </Button>
          </>
        }
      >
        <div className="vf-scroll-hide flex gap-1.5 overflow-x-auto">
          {PRESETS.map((p) => (
            <Chip key={p.value} active={preset === p.value} onClick={() => applyPreset(p.value)} tone={p.value === "custom" ? "light" : "dark"}>
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="From">
            <Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="vf-num" />
          </Field>
          <Field label="To">
            <Input type="date" value={to} min={from} max={todayISO()} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="vf-num" />
          </Field>
          <Button variant="ghost" onClick={refetch}>
            Refresh
          </Button>
        </div>
      </PageHeader>

      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {/* P&L strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {loading || !totals ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[118px] w-full rounded-[18px]" />)
        ) : (
          <>
            <StatTile label="Revenue" value={centsToUsd(totals.revenue)} tone="pine" footer={`${formatNumber(totals.orders)} invoices · ${usdCompact(totals.pending)} held`} spark={data?.timeline.map((t) => t.revenue)} />
            <StatTile label="Cost of goods" value={centsToUsd(totals.cost)} tone="clay" footer={`${pct(totals.cost, totals.revenue).toFixed(1)}% of revenue`} />
            <StatTile label="Gross profit" value={centsToUsd(totals.grossProfit)} tone="steel" delta={totals.marginPct} deltaLabel="margin rate" footer={`avg basket ${centsToUsd(totals.avgBasket)}`} />
            <StatTile label="Expenses" value={centsToUsd(totals.expenses)} tone="amber" footer={`${formatNumber(totals.expenseCount)} cost entries booked`} />
            <StatTile label="Net cash" value={centsToUsd(totals.netCash)} tone={totals.netCash >= 0 ? "pine" : "clay"} delta={pct(totals.netCash, totals.revenue)} deltaLabel="net margin" footer={`stock at cost ${usdCompact(stockValue)}`} />
          </>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-4 sm:p-5">
          <SectionTitle eyebrow="Daily ledger" title="Revenue, cost & outflow" hint="Green bars settle revenue, amber bars spend" />
          <div className="mt-4">
            {loading || !data ? (
              <Skeleton className="h-[168px] w-full" />
            ) : data.timeline.length ? (
              <TrendChart
                height={188}
                points={data.timeline.map((t) => ({ date: t.date, revenue: t.revenue, orders: t.orders, expenses: t.expenses }))}
              />
            ) : (
              <EmptyState title="No trading in this window" description="Pick a wider range above, or record a sale to populate the report." />
            )}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle eyebrow="Best sellers" title="Top lines by revenue" hint={`${formatDate(from)} → ${formatDate(to)}`} />
          <div className="mt-4">
            {loading || !data ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : data.salesByProduct.length ? (
              <RankBars rows={data.salesByProduct.slice(0, 8).map((p) => ({ label: p.name, value: p.revenue, sub: `${formatNumber(p.qty)} ${p.sku ? "" : ""}units` }))} />
            ) : (
              <EmptyState icon={<IconBox className="size-6" />} title="No lines sold" description="Sales made in this window will rank here." />
            )}
          </div>
        </Card>
      </section>

      {/* Stock valuation */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline px-4 py-3.5">
          <SectionTitle
            eyebrow="Valuation"
            title="Stock on hand"
            hint={`${formatNumber(data?.stock.length ?? 0)} SKUs · ${centsToUsd(stockValue)} at cost · ${centsToUsd(stockRetail)} at retail`}
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Filter SKUs" className="h-8 w-[168px] pl-8 text-[13px]" />
            </div>
            <Chip active={onlyIssues} onClick={() => setOnlyIssues((v) => !v)}>
              Needs action {issues.length ? `(${issues.length})` : ""}
            </Chip>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-8 w-[128px] py-0 text-[12.5px]">
              <option value="value">By stock value</option>
              <option value="potential">By potential</option>
              <option value="stock">By units</option>
              <option value="name">A–Z</option>
            </Select>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="sticky top-0 z-10 bg-paper/95 backdrop-blur">
              <tr className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-2">Item</th>
                <th className="px-2 py-2 text-right">On hand</th>
                <th className="px-2 py-2 text-right">Cover</th>
                <th className="px-2 py-2 text-right">At cost</th>
                <th className="px-2 py-2 text-right">At retail</th>
                <th className="px-4 py-2 text-right">Potential</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/70">
              {loading && !data ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-2.5">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : stock.length ? (
                stock.map((r) => (
                  <tr key={r.id} className="transition hover:bg-paper/70">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`vf-num grid size-8 shrink-0 place-items-center rounded-[10px] text-[10.5px] font-bold ${r.status === "out" ? "bg-clay-soft text-clay" : r.status === "low" ? "bg-amber-soft text-[#8a5a11]" : "bg-bright-soft text-pine"}`}>
                          {r.status === "healthy" ? r.sku.slice(-3) : <IconAlert className="size-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ink">{r.name}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {r.sku} · {r.category} · {r.bin} · {r.supplier}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="vf-num px-2 py-2.5 text-right text-[13px] font-bold text-ink">
                      {formatNumber(r.stock)}
                      <span className="block text-[10.5px] font-medium text-muted">{r.unit}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className={`vf-num text-[12.5px] font-semibold ${r.stock <= r.reorderLevel ? "text-clay" : "text-ink-2"}`}>
                        {r.reorderLevel ? `${(r.stock / r.reorderLevel).toFixed(1)}×` : "—"}
                      </span>
                      <span className="block text-[10.5px] text-muted">of reorder</span>
                    </td>
                    <td className="vf-num px-2 py-2.5 text-right text-[12.5px] text-ink-2">{centsToUsd(r.costValue)}</td>
                    <td className="vf-num px-2 py-2.5 text-right text-[12.5px] text-ink-2">{centsToUsd(r.retailValue)}</td>
                    <td className="vf-num px-4 py-2.5 text-right text-[13px] font-bold text-bright">
                      {centsToUsd(r.potential)}
                      <span className="block text-[10.5px] font-medium text-muted">{pct(r.potential, r.retailValue).toFixed(0)}% rate</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <p className="text-center text-[13px] text-muted">
                      {onlyIssues ? "Nothing is below its reorder point — the shelf is covered." : "No SKUs match this filter."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <SectionTitle eyebrow="Audit trail" title="Stock movements" />
            <Badge tone="neutral">{data?.movements.length ?? 0} shown</Badge>
          </div>
          <ul className="max-h-[360px] divide-y divide-hairline/70 overflow-y-auto">
            {loading && !data ? (
              Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="px-4 py-3">
                  <Skeleton className="h-5 w-full" />
                </li>
              ))
            ) : data?.movements.length ? (
              data.movements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-paper/70">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-[10px] ${m.qtyChange >= 0 ? "bg-bright-soft text-pine" : "bg-clay-soft text-clay"}`}>
                    {m.qtyChange >= 0 ? <IconArrowUp className="size-4" /> : <IconArrowDown className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{m.productName}</span>
                    <span className="block truncate text-[11px] text-muted">
                      <span className="vf-num">{m.reference || "no ref"}</span> · {m.note || m.type} · {m.createdByName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`vf-num block text-[13px] font-bold ${m.qtyChange >= 0 ? "text-pine" : "text-clay"}`}>
                      {m.qtyChange > 0 ? `+${m.qtyChange}` : m.qtyChange}
                    </span>
                    <span className="vf-num block text-[10.5px] text-muted">→ {m.stockAfter} on hand</span>
                  </span>
                </li>
              ))
            ) : (
              <li className="p-4">
                <EmptyState title="No movements in range" description="Receipts, sales and adjustments appear here as they are posted." />
              </li>
            )}
          </ul>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <SectionTitle eyebrow="Receivables" title="Owed by accounts" hint="Credit terms outstanding" />
            <div className="mt-3 space-y-2">
              {data?.receivables.length ? (
                data.receivables.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 rounded-[12px] border border-hairline bg-paper/50 p-2.5">
                    <span className="grid size-8 place-items-center rounded-[10px] bg-amber-soft text-[11px] font-bold text-[#8a5a11]">
                      {r.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{r.name}</span>
                      <span className="block text-[11px] text-muted">
                        limit {usdCompact(r.creditLimitCents)} · {pct(r.balanceCents, r.creditLimitCents).toFixed(0)}% used
                      </span>
                    </span>
                    <span className="vf-num text-[13px] font-bold text-clay">{centsToUsd(r.balanceCents)}</span>
                  </div>
                ))
              ) : (
                <EmptyState title="Nobody is on credit" description="Every invoice in this window was settled at the door." />
              )}
            </div>
            <Link href="/customers" className="mt-3 inline-block text-[12.5px] font-semibold text-pine hover:underline">
              Open the customer book →
            </Link>
          </Card>

          <Card className="vf-panel-dark border-0 p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-bright">Inventory snapshot</p>
            <p className="vf-display mt-2 text-[20px] font-bold leading-tight text-white">
              {centsToUsd(stockRetail - stockValue)} of margin sitting on the shelf
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/65">
              {formatNumber(data?.stock.length ?? 0)} SKUs worth {centsToUsd(stockValue)} at cost. {issues.length} need replenishment before
              the next van run to avoid a shelf-empty loss.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["Healthy", (data?.stock ?? []).filter((s) => s.status === "healthy").length],
                ["Low", (data?.stock ?? []).filter((s) => s.status === "low").length],
                ["Out", (data?.stock ?? []).filter((s) => s.status === "out").length],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-[11px] bg-white/8 px-2 py-2 text-center">
                  <p className="vf-num text-[16px] font-bold text-white">{value as number}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55">{label as string}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

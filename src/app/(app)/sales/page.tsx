"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlert,
  IconCard,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconMinus,
  IconPlus,
  IconReceipt,
  IconSearch,
  IconTruck,
  IconX,
} from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  ListSkeleton,
  Money,
  PageHeader,
  Select,
  Sheet,
  Stepper,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, invalidate, readCache, useDebounced, useResource, writeCache } from "@/lib/client";
import { centsToUsd, formatNumber, relativeTime, todayISO, usdCompact, usdToCents } from "@/lib/format";
import type { CustomerRow, ProductRow, SaleRow } from "@/lib/types";

type ListPayload = { rows: SaleRow[] };
type PosLine = { productId: number; name: string; sku: string; unit: string; priceCents: number; stock: number; qty: number };

const STATUS_TONE = { completed: "good", pending: "warn", refunded: "bad" } as const;
const METHOD_ICON: Record<string, typeof IconCash> = {
  cash: IconCash,
  card: IconCard,
  transfer: IconTruck,
  credit: IconReceipt,
};

export default function SalesPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rawQuery, setRawQuery] = useState("");
  const q = useDebounced(rawQuery.trim());
  const [status, setStatus] = useState<"all" | "completed" | "pending" | "refunded">("all");
  const [range, setRange] = useState("30d");

  const key = `sales:${q}:${status}:${range}`;
  const { data, loading, error, refetch } = useResource<ListPayload>(
    key,
    `/api/sales?q=${encodeURIComponent(q)}&status=${status}&range=${range}`,
  );
  const products = useResource<{ rows: ProductRow[] }>("products::all:all:stock", "/api/products?category=all&status=all&sort=stock");
  const reference = useResource<{ customers: CustomerRow[] }>("reference", "/api/reference");

  const [posOpen, setPosOpen] = useState(false);
  const openedFromQuery = useRef(false);

  useEffect(() => {
    if (openedFromQuery.current) return;
    const customer = searchParams.get("customer");
    const wantsNew = searchParams.get("new") === "1";
    if (!customer && !wantsNew) return;
    openedFromQuery.current = true;
    const frame = requestAnimationFrame(() => {
      if (customer) setRawQuery(customer);
      if (wantsNew) setPosOpen(true);
      router.replace("/sales");
    });
    return () => cancelAnimationFrame(frame);
  }, [searchParams, router]);

  const rows = data?.rows ?? [];
  const summary = useMemo(() => {
    const completed = rows.filter((r) => r.status === "completed");
    const revenue = completed.reduce((s, r) => s + r.totalCents, 0);
    const outstanding = rows.filter((r) => r.status !== "refunded").reduce((s, r) => s + (r.paymentMethod === "credit" || r.status === "pending" ? r.totalCents : 0), 0);
    const units = completed.reduce((s, r) => s + r.totalQty, 0);
    return {
      revenue,
      outstanding,
      orders: rows.length,
      units,
      avg: completed.length ? Math.round(revenue / completed.length) : 0,
      margin: completed.length ? ((completed.reduce((s, r) => s + r.totalCents - r.costCents, 0)) / Math.max(1, revenue)) * 100 : 0,
    };
  }, [rows]);

  function openPos() {
    setPosOpen(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales"
        subtitle="Invoices raised on the route, filtered by settlement state"
        actions={
          <Button size="sm" onClick={openPos} icon={<IconPlus className="size-4" />}>
            New sale
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: "Revenue in range", value: centsToUsd(summary.revenue), tone: "pine" },
            { label: "Outstanding", value: centsToUsd(summary.outstanding), tone: summary.outstanding > 0 ? "amber" : "pine" },
            { label: "Units shipped", value: formatNumber(summary.units), tone: "pine" },
            { label: "Avg order value", value: centsToUsd(summary.avg), tone: "pine" },
          ].map((s) => (
            <Card key={s.label} className="p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">{s.label}</p>
              <p className="vf-num mt-1 text-[19px] font-bold text-ink">{loading ? "—" : s.value}</p>
            </Card>
          ))}
        </div>
      </PageHeader>

      <div className="sticky top-14 z-20 -mx-3 space-y-2 bg-paper/85 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search invoice, customer or rep" className="pl-9" />
          </div>
          <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-[104px]">
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="all">All time</option>
          </Select>
        </div>
        <div className="vf-scroll-hide -mx-3 flex gap-1.5 overflow-x-auto px-3">
          {(["all", "completed", "pending", "refunded"] as const).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)} tone={s === "all" ? "dark" : "light"}>
              {s === "all" ? "All statuses" : s}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-hairline" />
          <Chip active={false} onClick={() => setRange("all")}>
            {formatNumber(summary.orders)} shown · {usdCompact(summary.revenue)}
          </Chip>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {loading && !data ? (
        <ListSkeleton rows={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconReceipt className="size-6" />}
          title={q || status !== "all" ? "Nothing matches that filter" : "No invoices in this window"}
          description={
            q || status !== "all"
              ? "Widen the date range or clear the status filter to see more of the route history."
              : "Raise your first invoice — stock drops, margin and the ledger all update in one tap."
          }
          action={
            <Button size="sm" onClick={openPos} icon={<IconPlus className="size-4" />}>
              New sale
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((s, i) => {
            const Icon = METHOD_ICON[s.paymentMethod] ?? IconCash;
            return (
              <li key={s.id} className="vf-rise" style={{ animationDelay: `${Math.min(i, 14) * 24}ms` }}>
                <Link href={`/sales/${s.id}`}>
                  <Card interactive className="group p-3.5">
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-[13px] ${
                          s.status === "completed" ? "bg-bright-soft text-pine" : s.status === "pending" ? "bg-amber-soft text-[#8a5a11]" : "bg-clay-soft text-clay"
                        }`}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="vf-display truncate text-[14.5px] font-bold text-ink">{s.customerName}</p>
                          <Badge tone={STATUS_TONE[s.status]} dot>
                            {s.status}
                          </Badge>
                          {s.paymentMethod === "credit" ? <Badge tone="info">on credit</Badge> : null}
                        </div>
                        <p className="vf-num mt-0.5 truncate text-[11.5px] text-muted">
                          {s.invoiceNo} · {s.channel} · {s.itemCount} lines · {s.soldByName} · {relativeTime(s.createdAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(s.items ?? []).slice(0, 4).map((line) => (
                            <span key={`${line.productId}-${line.qty}`} className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-2">
                              <span className="vf-num font-bold">{line.qty}×</span> {line.productName}
                            </span>
                          ))}
                          {(s.items ?? []).length > 4 ? (
                            <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                              +{s.items!.length - 4} more
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="vf-num text-[15px] font-bold text-ink">{centsToUsd(s.totalCents)}</p>
                        <p className="vf-num mt-0.5 text-[11px] text-muted">
                          {s.status === "refunded" ? "reversed" : `+${centsToUsd(s.totalCents - s.costCents)} margin`}
                        </p>
                        <IconChevronRight className="ml-auto mt-1.5 size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-pine" />
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <PosSheet
        open={posOpen}
        onClose={() => setPosOpen(false)}
        products={products.data?.rows ?? []}
        customers={reference.data?.customers ?? []}
        onDone={(row) => {
          const previous = readCache<ListPayload>(key);
          if (previous) writeCache<ListPayload>(key, { rows: [row, ...previous.rows] });
          invalidate("sales");
          invalidate("products");
          invalidate("dash");
          invalidate("reports");
        }}
        toast={toast}
      />
    </div>
  );
}

/* ------------------------------ POS sheet -------------------------------- */

function PosSheet({
  open,
  onClose,
  products,
  customers,
  onDone,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductRow[];
  customers: CustomerRow[];
  onDone: (row: SaleRow) => void;
  toast: { push: (t: { title: string; description?: string; variant?: "success" | "error" | "info" }) => number };
}) {
  const [lines, setLines] = useState<PosLine[]>([]);
  const [picker, setPicker] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [walkIn, setWalkIn] = useState("");
  const [channel, setChannel] = useState("Van");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(todayISO());
  const [discount, setDiscount] = useState("");
  const [applyTax, setApplyTax] = useState(true);
  const [note, setNote] = useState("");
  const [saveNote, setSaveNote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = picker.trim().toLowerCase();
    const list = products.filter((p) => p.active);
    if (!needle) return list.slice(0, 6);
    return list.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [products, picker]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.priceCents, 0);
  const discountCents = Math.min(usdToCents(discount), subtotal);
  const taxCents = applyTax ? Math.round((subtotal - discountCents) * 0.075) : 0;
  const total = subtotal - discountCents + taxCents;
  const cost = lines.reduce((s, l) => {
    const p = products.find((x) => x.id === l.productId);
    return s + (p?.costCents ?? 0) * l.qty;
  }, 0);

  function addLine(p: ProductRow) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: Math.min(l.stock, l.qty + 1) } : l));
      }
      return [...prev, { productId: p.id, name: p.name, sku: p.sku, unit: p.unit, priceCents: p.priceCents, stock: p.stock, qty: 1 }];
    });
    setPicker("");
  }

  function reset() {
    setLines([]);
    setDiscount("");
    setNote("");
    setWalkIn("");
    setError(null);
  }

  async function submit() {
    if (!lines.length) {
      setError("Add at least one product before settling the invoice.");
      return;
    }
    setBusy(true);
    setError(null);
    const customerName = customerId ? customers.find((c) => String(c.id) === customerId)?.name ?? "Walk-in" : walkIn.trim() || "Walk-in";
    try {
      const { row } = await api<{ row: SaleRow }>("/api/sales", {
        json: {
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
          customerId: customerId ? Number(customerId) : null,
          customerName,
          channel,
          paymentMethod: method,
          discountCents,
          applyTax,
          saleDate: date,
          status: saveNote ? "completed" : "pending",
          note,
        },
      });
      toast.push({
        title: `${row.invoiceNo} ${saveNote ? "settled" : "held"}`,
        description: `${centsToUsd(row.totalCents)} from ${row.customerName} · stock updated for ${row.itemCount} lines.`,
      });
      onDone(row);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the sale");
      toast.push({ title: "Invoice not saved", description: err instanceof Error ? err.message : "", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New sale"
      description="Build the invoice, we handle stock and margin"
      size="xl"
      footer={
        <>
          <div className="mr-auto flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-ink-2">
              <input type="checkbox" checked={saveNote} onChange={(e) => setSaveNote(e.target.checked)} className="size-3.5 accent-[#12433a]" />
              {saveNote ? "Settle now" : "Hold as pending"}
            </label>
            <label className="hidden cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-ink-2 sm:flex">
              <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} className="size-3.5 accent-[#12433a]" />
              VAT 7.5%
            </label>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={busy} onClick={submit} icon={<IconCheck className="size-4" />}>
            {saveNote ? `Take ${centsToUsd(total)}` : `Hold ${centsToUsd(total)}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: picker */}
        <div className="space-y-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={picker}
              onChange={(e) => setPicker(e.target.value)}
              placeholder="Scan or search the catalogue…"
              className="pl-9"
              autoFocus
            />
          </div>
          {filtered.length ? (
            <ul className="space-y-1.5">
              {filtered.map((p) => {
                const out = p.stock <= 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => addLine(p)}
                      className="vf-press flex w-full items-center gap-3 rounded-[13px] border border-hairline bg-paper/60 p-2.5 text-left transition hover:border-bright/45 hover:bg-bright-soft/40 disabled:opacity-50"
                    >
                      <span className={`vf-num grid size-9 shrink-0 place-items-center rounded-[11px] text-[11px] font-bold ${out ? "bg-clay-soft text-clay" : "bg-surface text-pine"}`}>
                        {out ? <IconAlert className="size-4" /> : p.stock}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {p.sku} · {p.category} · {p.unit}
                        </span>
                      </span>
                      <span className="vf-num shrink-0 text-[13px] font-bold text-ink">{centsToUsd(p.priceCents)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[13px] border border-dashed border-hairline bg-paper/50 p-5 text-center">
              <p className="text-[13px] font-semibold text-ink">No catalogue match</p>
              <p className="mt-1 text-[12px] text-muted">Add the SKU in Inventory first, or clear the search to browse stock.</p>
            </div>
          )}

          <div className="rounded-[14px] border border-hairline bg-paper/50 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">Invoice meta</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Customer">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Walk-in / other</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.segment}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={customerId ? "Account area" : "Walk-in name"}>
                {customerId ? (
                  <Input value={customers.find((c) => String(c.id) === customerId)?.area ?? ""} readOnly className="bg-paper text-muted" />
                ) : (
                  <Input value={walkIn} onChange={(e) => setWalkIn(e.target.value)} placeholder="Corner store" />
                )}
              </Field>
              <Field label="Channel">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {["Van", "Counter", "Wholesale", "Online"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tender">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {[
                    ["cash", "Cash"],
                    ["card", "Card"],
                    ["transfer", "Bank transfer"],
                    ["credit", "On credit (30d)"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date on invoice">
                <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="vf-num" />
              </Field>
              <Field label="Discount" hint="USD">
                <Money label="Discount" value={discount} onChange={setDiscount} placeholder="0.00" />
              </Field>
            </div>
            <Field label="Driver note" className="mt-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Left at the side gate, signed by supervisor…" rows={2} />
            </Field>
          </div>
        </div>

        {/* Right: cart */}
        <div className="flex flex-col rounded-[16px] border border-hairline bg-paper/60">
          <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
            <p className="vf-display text-[14px] font-bold text-ink">Cart</p>
            <span className="text-[11.5px] font-semibold text-muted">{lines.length} lines</span>
          </div>
          {lines.length ? (
            <ul className="max-h-[280px] flex-1 divide-y divide-hairline/70 overflow-y-auto px-3.5">
              {lines.map((l) => (
                <li key={l.productId} className="flex items-center gap-2.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{l.name}</p>
                    <p className="vf-num text-[11px] text-muted">
                      {centsToUsd(l.priceCents)} / {l.unit} · {l.stock} available
                    </p>
                  </div>
                  <Stepper
                    size="sm"
                    value={l.qty}
                    min={1}
                    max={Math.max(1, l.stock)}
                    onChange={(qty) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, qty } : x)))}
                  />
                  <span className="vf-num w-[70px] shrink-0 text-right text-[13px] font-bold text-ink">{centsToUsd(l.qty * l.priceCents)}</span>
                  <IconButton
                    label={`Remove ${l.name}`}
                    className="size-7 border-0 bg-transparent"
                    onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                  >
                    <IconX className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-surface text-muted">
                <IconMinus className="size-5" />
              </span>
              <p className="text-[13px] font-semibold text-ink">Empty cart</p>
              <p className="text-[12px] leading-relaxed text-muted">Tap products on the left to build this invoice. Stock is reserved the moment you settle.</p>
            </div>
          )}
          <div className="space-y-1.5 border-t border-hairline bg-surface p-3.5">
            {[
              ["Subtotal", subtotal],
              ["Discount", -discountCents],
              ["VAT 7.5%", taxCents],
            ].map(([label, value]) => (
              <p key={label as string} className="flex items-center justify-between text-[12.5px] text-muted">
                <span>{label}</span>
                <span className="vf-num font-semibold text-ink-2">
                  {(value as number) < 0 ? "-" : ""}
                  {centsToUsd(Math.abs(value as number))}
                </span>
              </p>
            ))}
            <div className="mt-1.5 flex items-end justify-between border-t border-dashed border-hairline pt-2">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">Total due</p>
                <p className="vf-num text-[22px] font-bold leading-tight text-pine">{centsToUsd(total)}</p>
              </div>
              <p className="vf-num text-[11.5px] font-semibold text-bright">+{centsToUsd(total - cost)} margin</p>
            </div>
            {error ? (
              <p className="mt-1 flex items-start gap-1.5 rounded-[10px] bg-clay-soft/70 p-2 text-[12px] font-medium text-clay">
                <IconAlert className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

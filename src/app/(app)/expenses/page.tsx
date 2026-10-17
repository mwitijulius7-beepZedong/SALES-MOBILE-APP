"use client";

import { useMemo, useState } from "react";
import { IconAlert, IconPlus, IconSearch, IconTrash, IconPencil, IconWallet } from "@/components/icons";
import { Donut } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  ListSkeleton,
  Money,
  PageHeader,
  SectionTitle,
  Select,
  Sheet,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, invalidate, readCache, useDebounced, useResource, writeCache } from "@/lib/client";
import { centsToUsd, formatDate, formatNumber, todayISO, usdToCents } from "@/lib/format";
import type { ExpenseRow } from "@/lib/types";

type Payload = {
  rows: ExpenseRow[];
  summary: { amount: number; count: number; avg: number };
  byCategory: { label: string; value: number; count: number }[];
};

const CATEGORIES = ["Logistics", "Operations", "Maintenance", "Utilities", "Team", "Marketing", "Packaging", "Office", "Insurance", "Equipment"];
const PALETTE = ["#12433a", "#1fa97c", "#e9a23b", "#2e6fa7", "#c4453b", "#6f4b8f", "#3c4650", "#8a7a3f"];

const emptyForm = {
  title: "",
  category: "Logistics",
  vendor: "",
  amount: "",
  paymentMethod: "cash",
  expenseDate: todayISO(),
  billable: false,
  note: "",
};

export default function ExpensesPage() {
  const toast = useToast();
  const [rawQuery, setRawQuery] = useState("");
  const q = useDebounced(rawQuery.trim());
  const [category, setCategory] = useState("all");
  const [range, setRange] = useState("30d");
  const key = `expenses:${q}:${category}:${range}`;
  const { data, loading, error, refetch, setData } = useResource<Payload>(
    key,
    `/api/expenses?q=${encodeURIComponent(q)}&category=${category}&range=${range}`,
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ExpenseRow | null>(null);

  const rows = data?.rows ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, ExpenseRow[]>();
    for (const r of rows) {
      const list = map.get(r.expenseDate) ?? [];
      list.push(r);
      map.set(r.expenseDate, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const topCategory = data?.byCategory?.[0];
  const billableTotal = rows.filter((r) => r.billable).reduce((s, r) => s + r.amountCents, 0);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: ExpenseRow) {
    setEditing(row);
    setForm({
      title: row.title,
      category: row.category,
      vendor: row.vendor === "—" ? "" : row.vendor,
      amount: (row.amountCents / 100).toFixed(2),
      paymentMethod: row.paymentMethod,
      expenseDate: row.expenseDate,
      billable: row.billable,
      note: row.note,
    });
    setFormError(null);
    setOpen(true);
  }

  async function submit() {
    if (!form.title.trim()) {
      setFormError("Give the expense a label so it is findable later");
      return;
    }
    if (usdToCents(form.amount) <= 0) {
      setFormError("Amount must be more than zero");
      return;
    }
    setBusy(true);
    const payload = { ...form, amountCents: usdToCents(form.amount) };
    const previous = readCache<Payload>(key);
    const temp: ExpenseRow = {
      id: editing?.id ?? -Date.now(),
      title: form.title,
      category: form.category,
      vendor: form.vendor || "—",
      amountCents: payload.amountCents,
      paymentMethod: form.paymentMethod,
      expenseDate: form.expenseDate,
      billable: form.billable,
      note: form.note,
      createdByName: editing?.createdByName ?? "You",
      createdAt: new Date().toISOString(),
    };
    const nextRows = editing ? rows.map((r) => (r.id === editing.id ? temp : r)) : [temp, ...rows];
    const optimistic: Payload = {
      rows: nextRows,
      summary: {
        amount: nextRows.reduce((s, r) => s + r.amountCents, 0),
        count: nextRows.length,
        avg: nextRows.length ? Math.round(nextRows.reduce((s, r) => s + r.amountCents, 0) / nextRows.length) : 0,
      },
      byCategory: data?.byCategory ?? [],
    };
    writeCache<Payload>(key, optimistic);
    setData(optimistic);

    try {
      if (editing) await api(`/api/expenses/${editing.id}`, { method: "PUT", json: payload });
      else await api("/api/expenses", { json: payload });
      setOpen(false);
      toast.push({ title: editing ? "Expense updated" : "Expense logged", description: `${form.title} · ${centsToUsd(payload.amountCents)}` });
      invalidate("expenses");
      invalidate("dash");
      invalidate("reports");
    } catch (err) {
      if (previous) writeCache<Payload>(key, previous);
      setData(previous);
      setFormError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm) return;
    const target = confirm;
    const previous = readCache<Payload>(key);
    if (previous) {
      const rowsNext = previous.rows.filter((r) => r.id !== target.id);
      const next: Payload = {
        ...previous,
        rows: rowsNext,
        summary: { ...previous.summary, amount: rowsNext.reduce((s, r) => s + r.amountCents, 0), count: rowsNext.length },
      };
      writeCache<Payload>(key, next);
      setData(next);
    }
    setConfirm(null);
    try {
      await api(`/api/expenses/${target.id}`, { method: "DELETE" });
      toast.push({ title: "Expense deleted", description: `${target.title} removed from the ledger.` });
      invalidate("expenses");
      invalidate("reports");
      invalidate("dash");
    } catch (err) {
      if (previous) writeCache<Payload>(key, previous);
      toast.push({ title: "Delete failed", description: err instanceof Error ? err.message : "", variant: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        subtitle="Route costs, upkeep and team spend — logged in seconds"
        actions={
          <Button size="sm" onClick={openCreate} icon={<IconPlus className="size-4" />}>
            Log expense
          </Button>
        }
      />

      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      <section className="grid gap-3 lg:grid-cols-[1fr_1.35fr]">
        <Card className="p-4 sm:p-5">
          <SectionTitle eyebrow={range} title="Spend mix" hint="Tap a slice to isolate a category" />
          <div className="mt-4">
            {loading || !data ? (
              <div className="flex items-center gap-4">
                <div className="vf-skeleton size-[132px] rounded-full" />
                <div className="flex-1 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="vf-skeleton h-3.5 w-full" />
                  ))}
                </div>
              </div>
            ) : data.byCategory.length ? (
              <Donut
                slices={data.byCategory.map((c, i) => ({ label: c.label, value: c.value, color: PALETTE[i % PALETTE.length] }))}
                caption="total spend"
                centerValue={centsToUsd(data.summary.amount).replace(/\.00$/, "")}
              />
            ) : (
              <EmptyState
                icon={<IconWallet className="size-6" />}
                title="No costs in this window"
                description="Log fuel, servicing or labour as you spend — margin reports stay honest."
                action={
                  <Button size="sm" onClick={openCreate}>
                    Log expense
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Total spend", value: centsToUsd(data?.summary.amount ?? 0) },
              { label: "Entries", value: formatNumber(data?.summary.count ?? 0) },
              { label: "Average", value: centsToUsd(data?.summary.avg ?? 0) },
              { label: "Rechargeable", value: centsToUsd(billableTotal) },
            ].map((s) => (
              <Card key={s.label} className="p-3.5">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">{s.label}</p>
                <p className="vf-num mt-1 text-[17px] font-bold text-ink">{loading ? "—" : s.value}</p>
              </Card>
            ))}
          </div>
          {topCategory && !loading ? (
            <Card className="flex items-start gap-3 border-amber/35 bg-amber-soft/40 p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-amber/25 text-[#8a5a11]">
                <IconAlert className="size-[18px]" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink">
                  {topCategory.label} is your heaviest bucket at {centsToUsd(topCategory.value)} across {topCategory.count} entries
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {formatDate(rows[0]?.expenseDate ?? todayISO())} was the last posting. Review the route plan if this bucket keeps growing week on week.
                </p>
              </div>
            </Card>
          ) : null}
        </div>
      </section>

      <div className="sticky top-14 z-20 -mx-3 space-y-2 bg-paper/85 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search title, vendor or note" className="pl-9" />
          </div>
          <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-[104px]">
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="all">All time</option>
          </Select>
        </div>
        <div className="vf-scroll-hide -mx-3 flex gap-1.5 overflow-x-auto px-3">
          <Chip active={category === "all"} onClick={() => setCategory("all")} tone="dark">
            All categories
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <ListSkeleton rows={6} />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<IconWallet className="size-6" />}
          title={q || category !== "all" ? "No expenses match" : "Ledger is clear"}
          description={q || category !== "all" ? "Clear the search or switch back to all categories to see the rest." : "Nothing has been booked against this window — add your first cost line."}
          action={
            <Button size="sm" onClick={openCreate} icon={<IconPlus className="size-4" />}>
              Log expense
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, list]) => (
            <section key={date}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="vf-display text-[13px] font-bold uppercase tracking-[0.1em] text-muted">
                  {formatDate(date)}
                  {new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                </h3>
                <p className="vf-num text-[12.5px] font-bold text-ink">{centsToUsd(list.reduce((s, r) => s + r.amountCents, 0))}</p>
              </div>
              <ul className="space-y-1.5">
                {list.map((r, i) => (
                  <li key={r.id} className="vf-rise" style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}>
                    <Card interactive className="group flex items-center gap-3 p-3">
                      <span className="vf-num grid w-14 shrink-0 place-items-center rounded-[11px] bg-paper py-2 text-[11px] font-bold text-ink-2">
                        {formatDate(r.expenseDate)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[13.5px] font-semibold text-ink">{r.title}</p>
                          <Badge tone="neutral">{r.category}</Badge>
                          {r.billable ? <Badge tone="info">rechargeable</Badge> : null}
                          {r.id < 0 ? <Badge tone="warn">saving…</Badge> : null}
                        </div>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {r.vendor} · paid by {r.paymentMethod} · {r.createdByName}
                        </p>
                        {r.note ? <p className="mt-1 truncate text-[11.5px] italic text-muted/85">“{r.note}”</p> : null}
                      </div>
                      <p className="vf-num shrink-0 text-right text-[14px] font-bold text-ink">{centsToUsd(r.amountCents)}</p>
                      <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <IconButton label="Edit expense" className="size-8" onClick={() => openEdit(r)}>
                          <IconPencil className="size-4" />
                        </IconButton>
                        <IconButton label="Delete expense" tone="danger" className="size-8" onClick={() => setConfirm(r)}>
                          <IconTrash className="size-4" />
                        </IconButton>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit expense" : "Log an expense"}
        description="Costs land against the date you pick, feeding margin and net cash"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submit}>
              {editing ? "Save change" : "Add to ledger"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="What did you spend on?" className="sm:col-span-2" error={formError ?? undefined}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Van fuel — east loop" />
          </Field>
          <Field label="Amount">
            <Money label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vendor">
            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Metro Petrol Co" />
          </Field>
          <Field label="Date">
            <Input type="date" max={todayISO()} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="vf-num" />
          </Field>
          <Field label="Tender">
            <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {["cash", "card", "transfer", "credit"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <label className="mt-7 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
            <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} className="size-4 accent-[#12433a]" />
            Rechargeable to a customer
          </label>
          <Field label="Receipt reference" className="sm:col-span-2">
            <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Receipt #4412, paid to attendant at Junction forecourt" />
          </Field>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!confirm}
        title={`Delete “${confirm?.title ?? ""}”?`}
        body="The amount is removed from margin, net cash and every report immediately. This cannot be undone."
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
      />
    </div>
  );
}

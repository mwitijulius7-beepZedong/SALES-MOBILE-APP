"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  IconAlert,
  IconBox,
  IconCheck,
  IconDownload,
  IconLayers,
  IconPackageCheck,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Input,
  ListSkeleton,
  Meter,
  Money,
  PageHeader,
  SectionTitle,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Stepper,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, invalidate, patchCache, readCache, useDebounced, useResource, writeCache } from "@/lib/client";

import { centsToUsd, formatNumber, pct, todayISO, usdToCents } from "@/lib/format";
import type { ProductRow } from "@/lib/types";

type ListPayload = { rows: ProductRow[] };

const emptyForm = {
  name: "",
  sku: "",
  category: "Beverages",
  unit: "cs",
  cost: "",
  price: "",
  stock: "0",
  reorderLevel: "20",
  bin: "A-01",
  supplier: "",
  active: true,
};

type FormState = typeof emptyForm;

export default function InventoryPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [rawQuery, setRawQuery] = useState("");
  const q = useDebounced(rawQuery.trim());
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | "low" | "out" | "healthy">("all");
  const [sort, setSort] = useState("stock");

  const key = `products:${q}:${category}:${status}:${sort}`;
  const path = `/api/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&status=${status}&sort=${sort}`;
  const { data, loading, error, refetch, setData } = useResource<ListPayload>(key, path);
  const reference = useResource<{ categories: string[]; suppliers: string[] }>("reference", "/api/reference");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [adjustFor, setAdjustFor] = useState<ProductRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState(10);
  const [adjustReason, setAdjustReason] = useState("receipt");
  const [adjustRef, setAdjustRef] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [confirm, setConfirm] = useState<ProductRow | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const rows = data?.rows ?? [];

  /* Deep link: /inventory?focus=<id> opens the stock sheet, ?new=1 opens create form */
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !data) return;
    const focus = searchParams.get("focus");
    const isNew = searchParams.get("new");
    if (!focus && !isNew) return;
    handled.current = true;
    requestAnimationFrame(() => {
      if (isNew) openCreate();
      if (focus) {
        const found = data.rows.find((r) => String(r.id) === focus);
        if (found) openAdjust(found);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchParams]);

  const summary = useMemo(() => {
    const costValue = rows.reduce((s, r) => s + r.stock * r.costCents, 0);
    const retailValue = rows.reduce((s, r) => s + r.stock * r.priceCents, 0);
    return {
      skus: rows.length,
      units: rows.reduce((s, r) => s + r.stock, 0),
      costValue,
      retailValue,
      low: rows.filter((r) => r.status === "low").length,
      out: rows.filter((r) => r.status === "out").length,
    };
  }, [rows]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, category: reference.data?.categories?.[0] ?? "Beverages" });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: ProductRow) {
    setEditing(row);
    setForm({
      name: row.name,
      sku: row.sku,
      category: row.category,
      unit: row.unit,
      cost: (row.costCents / 100).toFixed(2),
      price: (row.priceCents / 100).toFixed(2),
      stock: String(row.stock),
      reorderLevel: String(row.reorderLevel),
      bin: row.bin,
      supplier: row.supplier === "—" ? "" : row.supplier,
      active: row.active,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openAdjust(row: ProductRow) {
    setAdjustFor(row);
    setAdjustDelta(Math.max(5, row.reorderLevel - row.stock));
    setAdjustReason(row.stock <= 0 ? "receipt" : "adjustment");
    setAdjustRef("");
    setAdjustNote("");
  }

  async function submitForm() {
    setSaving(true);
    setFormError(null);
    const payload = {
      ...form,
      stock: Number(form.stock) || 0,
      reorderLevel: Number(form.reorderLevel) || 0,
      costCents: usdToCents(form.cost),
      priceCents: usdToCents(form.price),
    };

    // optimistic insert / patch
    const tempId = editing ? editing.id : -Math.floor(Math.random() * 1e6);
    const optimistic: ProductRow = {
      ...(editing ?? ({} as ProductRow)),
      ...payload,
      id: tempId,
      costCents: payload.costCents,
      priceCents: payload.priceCents,
      marginCents: payload.priceCents - payload.costCents,
      marginPct: payload.priceCents ? ((payload.priceCents - payload.costCents) / payload.priceCents) * 100 : 0,
      stockValueCents: payload.stock * payload.costCents,
      status: payload.stock <= 0 ? "out" : payload.stock <= payload.reorderLevel ? "low" : "healthy",
      active: payload.active,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bin: payload.bin || "A-01",
      supplier: payload.supplier || "—",
      sku: payload.sku || "…",
      unit: payload.unit,
      movements: editing?.movements,
      soldQty30d: editing?.soldQty30d ?? 0,
      soldRevenue30d: editing?.soldRevenue30d ?? 0,
    } as ProductRow;

    const previous = readCache<ListPayload>(key);
    const nextRows = editing
      ? (previous?.rows ?? []).map((r) => (r.id === editing.id ? optimistic : r))
      : [optimistic, ...(previous?.rows ?? [])];
    writeCache<ListPayload>(key, { rows: nextRows });
    setData({ rows: nextRows });

    try {
      if (editing) {
        await api(`/api/products/${editing.id}`, { method: "PUT", json: payload });
      } else {
        await api("/api/products", { json: payload });
      }
      setFormOpen(false);
      toast.push({
        title: editing ? "Product updated" : "Product added",
        description: `${payload.name} is live in the catalogue.`,
      });
      invalidate("products");
      invalidate("dash");
    } catch (err) {
      if (previous) writeCache<ListPayload>(key, previous);
      setData(previous);
      setFormError(err instanceof Error ? err.message : "Could not save the product");
      toast.push({ title: "Save failed", description: "We rolled the change back.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjust() {
    if (!adjustFor) return;
    setAdjustBusy(true);
    const signed = adjustReason === "receipt" || adjustReason === "return" ? Math.abs(adjustDelta) : adjustReason === "damage" ? -Math.abs(adjustDelta) : adjustDelta;
    const projected = Math.max(0, adjustFor.stock + signed);
    const previous = readCache<ListPayload>(key);
    patchCache<ListPayload>(key, (prev) => ({
      rows: prev.rows.map((r) => (r.id === adjustFor.id ? { ...r, stock: projected } : r)),
    }));

    try {
      await api("/api/stock/adjust", {
        json: {
          productId: adjustFor.id,
          qtyChange: signed,
          reason: adjustReason,
          reference: adjustRef,
          note: adjustNote,
        },
      });
      toast.push({
        title: "Stock adjusted",
        description: `${adjustFor.name} now at ${projected} ${adjustFor.unit}.`,
      });
      setAdjustFor(null);
      invalidate("products");
      invalidate("dash");
      invalidate("reports");
    } catch (err) {
      if (previous) writeCache<ListPayload>(key, previous);
      toast.push({
        title: "Adjustment rejected",
        description: err instanceof Error ? err.message : "Server refused the change",
        variant: "error",
      });
    } finally {
      setAdjustBusy(false);
    }
  }

  async function removeProduct() {
    if (!confirm) return;
    setConfirmBusy(true);
    const target = confirm;
    const previous = readCache<ListPayload>(key);
    if (previous) {
      const filtered = { rows: previous.rows.filter((r) => r.id !== target.id) };
      writeCache<ListPayload>(key, filtered);
      setData(filtered);
    }
    setConfirm(null);
    try {
      const res = await api<{ archived: boolean }>(`/api/products/${target.id}`, { method: "DELETE" });
      toast.push({
        title: res.archived ? "Product archived" : "Product deleted",
        description: res.archived
          ? `${target.name} has sales history, so it was hidden from the active catalogue.`
          : `${target.name} was removed with its movement history.`,
        variant: "undo",
        duration: 6000,
      });
      invalidate("products");
      invalidate("dash");
    } catch (err) {
      if (previous) writeCache<ListPayload>(key, previous);
      toast.push({ title: "Delete failed", description: err instanceof Error ? err.message : "", variant: "error" });
    } finally {
      setConfirmBusy(false);
    }
  }

  function exportCsv() {
    const header = ["sku", "name", "category", "unit", "stock", "reorder_level", "cost_usd", "price_usd", "bin", "supplier"];
    const lines = rows.map((r) =>
      [r.sku, `"${r.name}"`, `"${r.category}"`, r.unit, r.stock, r.reorderLevel, (r.costCents / 100).toFixed(2), (r.priceCents / 100).toFixed(2), r.bin, `"${r.supplier}"`].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendflow-inventory-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push({ title: "CSV exported", description: `${rows.length} SKUs written to your downloads.` });
  }

  const filtersActive = q.length > 0 || category !== "all" || status !== "all";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        subtitle="Catalogue, on-hand counts and reorder health"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} icon={<IconDownload className="size-4" />}>
              CSV
            </Button>
            <Button size="sm" onClick={openCreate} icon={<IconPlus className="size-4" />} className="hidden sm:inline-flex">
              Add product
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "SKUs", value: formatNumber(summary.skus), icon: <IconLayers className="size-4" /> },
            { label: "Units on hand", value: formatNumber(summary.units), icon: <IconBox className="size-4" /> },
            { label: "Stock at cost", value: centsToUsd(summary.costValue), icon: <IconPackageCheck className="size-4" /> },
            { label: "Retail value", value: centsToUsd(summary.retailValue), icon: <IconCheck className="size-4" /> },
            { label: "Needs action", value: `${summary.low + summary.out}`, icon: <IconAlert className="size-4" />, tone: summary.low + summary.out > 0 ? "warn" : "ok" },
          ].map((s) => (
            <Card key={s.label} className={`flex items-center gap-2.5 p-3 ${s.tone === "warn" ? "border-amber/40 bg-amber-soft/40" : ""}`}>
              <span className={`grid size-8 place-items-center rounded-[10px] ${s.tone === "warn" ? "bg-amber/20 text-[#8a5a11]" : "bg-paper text-ink-2"}`}>
                {s.icon}
              </span>
              <span className="min-w-0">
                <span className="vf-num block truncate text-[15px] font-bold text-ink">{loading ? "—" : s.value}</span>
                <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{s.label}</span>
              </span>
            </Card>
          ))}
        </div>
      </PageHeader>

      {/* Filter bar */}
      <div className="sticky top-14 z-20 -mx-3 space-y-2 bg-paper/85 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Search name, SKU or supplier"
              className="pl-9"
            />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-[132px] sm:w-[150px]">
            <option value="stock">Low stock first</option>
            <option value="margin">Top margin</option>
            <option value="price">Highest price</option>
            <option value="updated">Recently touched</option>
          </Select>
        </div>
        <div className="vf-scroll-hide -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
          <Chip active={status === "all"} onClick={() => setStatus("all")} tone="dark">
            All stock
          </Chip>
          <Chip active={status === "low"} onClick={() => setStatus("low")}>
            Low ({loading ? "…" : summary.low})
          </Chip>
          <Chip active={status === "out"} onClick={() => setStatus("out")}>
            Out ({loading ? "…" : summary.out})
          </Chip>
          <Chip active={status === "healthy"} onClick={() => setStatus("healthy")}>
            Healthy
          </Chip>
          <span className="mx-1 w-px shrink-0 bg-hairline" />
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All categories
          </Chip>
          {(reference.data?.categories ?? []).map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {loading && !data ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={filtersActive ? <IconSearch className="size-6" /> : <IconBox className="size-6" />}
          title={filtersActive ? "No SKUs match those filters" : "Your catalogue is empty"}
          description={
            filtersActive
              ? "Try a different category or clear the stock status filter to see everything again."
              : "Add your first product to start tracking on-hand counts, margin and reorder points."
          }
          action={
            filtersActive ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRawQuery("");
                  setCategory("all");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={openCreate} icon={<IconPlus className="size-4" />}>
                Add product
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p, i) => {
            const tone = p.status === "out" ? "bad" : p.status === "low" ? "warn" : "good";
            const fill = pct(p.stock, Math.max(p.reorderLevel * 2, 1));
            return (
              <li key={p.id} className="vf-rise" style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}>
                <Card interactive className="group h-full p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="vf-num rounded-md bg-paper px-1.5 py-0.5 text-[10.5px] font-bold text-ink-2">{p.sku}</span>
                        {p.active ? null : <Badge tone="neutral">hidden</Badge>}
                      </div>
                      <h3 className="vf-display mt-1.5 truncate text-[14.5px] font-semibold text-ink">{p.name}</h3>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted">
                        {p.category} · {p.bin} · {p.supplier}
                      </p>
                    </div>
                    <Badge tone={tone as "bad" | "warn" | "good"} dot>
                      {p.status === "out" ? "out" : p.status === "low" ? "low" : "ok"}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-[12px] bg-paper/70 p-2.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Price</p>
                      <p className="vf-num text-[13.5px] font-bold text-ink">{centsToUsd(p.priceCents)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Margin</p>
                      <p className="vf-num text-[13.5px] font-bold text-pine">{(p.marginPct ?? 0).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">30d sold</p>
                      <p className="vf-num text-[13.5px] font-bold text-ink">{formatNumber(p.soldQty30d ?? 0)}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">On hand</p>
                      <p className="vf-num text-[13px] font-bold text-ink">
                        {formatNumber(p.stock)} <span className="text-[11px] font-medium text-muted">{p.unit} · reorder {p.reorderLevel}</span>
                      </p>
                    </div>
                    <Meter value={fill} max={100} tone={p.status === "out" ? "clay" : p.status === "low" ? "amber" : "bright"} className="mt-1.5" />
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openAdjust(p)} icon={<IconPackageCheck className="size-4" />}>
                      Adjust
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                      <IconPencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(p)} aria-label={`Delete ${p.name}`}>
                      <IconTrash className="size-4 text-clay" />
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Mobile FAB */}
      <button
        type="button"
        onClick={openCreate}
        className="vf-press fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-2xl bg-pine text-paper shadow-[0_18px_36px_-16px_rgba(18,67,58,0.9)] sm:hidden"
        aria-label="Add product"
      >
        <IconPlus className="size-6" />
      </button>

      {/* Create / edit */}
      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit product" : "New product"}
        description={editing ? `SKU ${editing.sku}` : "Add an item to the catalogue and set its reorder point"}
        size="lg"
        footer={
          <>
            {editing ? (
              <Button variant="ghost" className="mr-auto text-clay" onClick={() => { setFormOpen(false); setConfirm(editing); }}>
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submitForm}>
              {editing ? "Save changes" : "Add to catalogue"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Product name" className="sm:col-span-2" error={formError ?? undefined}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cola Fresh 50cl x24" />
          </Field>
          <Field label="SKU" hint="auto if blank">
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} placeholder="VF-1200" className="vf-num" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {(reference.data?.categories ?? [form.category]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cost per unit">
            <Money label="Cost per unit" value={form.cost} onChange={(v) => setForm({ ...form, cost: v })} />
          </Field>
          <Field label="Sell price" hint={form.price ? `${pct(usdToCents(form.price) - usdToCents(form.cost), Math.max(1, usdToCents(form.price))).toFixed(0)}% margin` : undefined}>
            <Money label="Sell price" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {["cs", "pc", "kg", "ltr", "pack"].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reorder level">
            <Input inputMode="numeric" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value.replace(/\D/g, "") })} className="vf-num" />
          </Field>
          <Field label="Opening stock" hint={editing ? "edits set the count" : "units on hand"}>
            <Input inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} className="vf-num" />
          </Field>
          <Field label="Bin location">
            <Input value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} placeholder="A-01" className="vf-num" />
          </Field>
          <Field label="Supplier" className="sm:col-span-2">
            <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Northline Bottling" list="suppliers" />
            <datalist id="suppliers">
              {(reference.data?.suppliers ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <label className="flex items-center gap-3 rounded-[12px] border border-hairline bg-paper p-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="size-4 accent-[#12433a]"
            />
            <span className="text-[13px] font-medium text-ink-2">
              Show in the sales picker
              <span className="ml-1 text-muted">— uncheck to archive without losing history</span>
            </span>
          </label>
        </div>
      </Sheet>

      {/* Stock adjustment */}
      <Sheet
        open={!!adjustFor}
        onClose={() => setAdjustFor(null)}
        title="Adjust stock"
        description={adjustFor ? `${adjustFor.name} · currently ${adjustFor.stock} ${adjustFor.unit}` : ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustFor(null)}>
              Cancel
            </Button>
            <Button loading={adjustBusy} onClick={submitAdjust}>
              Post movement
            </Button>
          </>
        }
      >
        {adjustFor ? (
          <div className="space-y-4">
            <div className="rounded-[14px] border border-hairline bg-paper p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Change</p>
                  <p className="vf-num mt-1 text-[22px] font-bold text-ink">
                    {adjustReason === "damage" ? "-" : (adjustReason === "receipt" || adjustReason === "return" ? "+" : adjustDelta >= 0 ? "+" : "-")}
                    {Math.abs(adjustDelta)} <span className="text-[13px] font-medium text-muted">{adjustFor.unit}</span>
                  </p>
                </div>
                <Stepper value={Math.abs(adjustDelta)} min={1} max={5000} onChange={(v) => setAdjustDelta(v)} />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
                <span className="text-[12px] text-muted">Resulting count</span>
                <span className="vf-num ml-auto text-[15px] font-bold text-pine">
                  {Math.max(
                    0,
                    adjustFor.stock +
                      (adjustReason === "receipt" || adjustReason === "return"
                        ? Math.abs(adjustDelta)
                        : adjustReason === "damage"
                          ? -Math.abs(adjustDelta)
                          : adjustDelta),
                  )}{" "}
                  {adjustFor.unit}
                </span>
              </div>
            </div>
            <Field label="Movement type">
              <Select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}>
                <option value="receipt">Receipt — delivery in</option>
                <option value="adjustment">Adjustment — cycle count</option>
                <option value="return">Return — stock from customer</option>
                <option value="damage">Damage / shrink</option>
              </Select>
            </Field>
            <Field label="Reference" hint="GRN or count sheet">
              <Input value={adjustRef} onChange={(e) => setAdjustRef(e.target.value)} placeholder="GRN-482" className="vf-num" />
            </Field>
            <Field label="Note">
              <Textarea value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Two cases crushed in transit…" />
            </Field>
            <button
              type="button"
              onClick={() => {
                setAdjustReason("receipt");
                setAdjustDelta(Math.max(5, adjustFor.reorderLevel * 2 - adjustFor.stock));
              }}
              className="vf-press flex w-full items-center justify-between rounded-[12px] border border-dashed border-bright/45 bg-bright-soft/50 px-3 py-2.5 text-[12.5px] font-semibold text-pine transition hover:bg-bright-soft"
            >
              Quick fill to 2× reorder point
              <span className="vf-num">+{Math.max(5, adjustFor.reorderLevel * 2 - adjustFor.stock)}</span>
            </button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmSheet
        open={!!confirm}
        busy={confirmBusy}
        title={`Remove ${confirm?.name ?? "product"}?`}
        body={
          "If this SKU already appears on invoices we archive it instead of deleting, so sales history and margins stay intact. Otherwise the product and its movement log are removed for good."
        }
        confirmLabel="Remove product"
        onCancel={() => setConfirm(null)}
        onConfirm={removeProduct}
      />
    </div>
  );
}

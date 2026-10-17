"use client";

import { useState } from "react";
import {
  IconAlert,
  IconCheck,
  IconClipboard,
  IconClock,
  IconPackageCheck,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTruck,
  IconX,
} from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  ListSkeleton,
  PageHeader,
  Select,
  Sheet,
  Stepper,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, invalidate, readCache, useDebounced, useResource, writeCache } from "@/lib/client";
import { formatDate, isoDaysAgo, relativeTime, todayISO } from "@/lib/format";
import type { ProductRow, RequisitionRow } from "@/lib/types";

type Payload = { rows: RequisitionRow[]; counts: Record<string, number> };

const PRIORITY_TONE = { low: "neutral", normal: "info", high: "warn", urgent: "bad" } as const;
const TABS = [
  { value: "pending", label: "Awaiting" },
  { value: "approved", label: "Approved" },
  { value: "received", label: "Received" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const emptyForm = {
  productId: "",
  requestedQty: "24",
  department: "Field Sales",
  requester: "",
  priority: "normal",
  neededBy: isoDaysAgo(-3),
  notes: "",
};

export default function RequisitionsPage() {
  const toast = useToast();
  const [rawQuery, setRawQuery] = useState("");
  const q = useDebounced(rawQuery.trim());
  const [tab, setTab] = useState<Tab>("pending");
  const key = `requisitions:${q}:${tab}`;
  const { data, loading, error, refetch, setData } = useResource<Payload>(
    key,
    `/api/requisitions?q=${encodeURIComponent(q)}&status=${tab}`,
  );
  const products = useResource<{ rows: ProductRow[] }>("products::all:all:stock", "/api/products?category=all&status=all&sort=stock");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RequisitionRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ row: RequisitionRow; action: "rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<RequisitionRow | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? {};

  async function act(row: RequisitionRow, status: "approved" | "received" | "rejected" | "pending", note = "") {
    setActing(row.id);
    const previous = readCache<Payload>(key);
    const projected: RequisitionRow = {
      ...row,
      status,
      approvedQty: status === "approved" ? row.requestedQty : status === "rejected" ? 0 : row.approvedQty || row.requestedQty,
      decisionNote: note,
      decidedAt: new Date().toISOString(),
      decidedBy: "You",
    };
    // Optimistic: move the card out of the current tab instantly, then reconcile with the server.
    if (previous) {
      const nextRows =
        tab === "all"
          ? previous.rows.map((r) => (r.id === row.id ? projected : r))
          : status === "pending"
            ? [projected, ...previous.rows.filter((r) => r.id !== row.id)]
            : previous.rows.filter((r) => r.id !== row.id);
      const next: Payload = {
        ...previous,
        rows: nextRows,
        counts: {
          ...previous.counts,
          [status]: (previous.counts[status] ?? 0) + 1,
          ...(tab !== "all" && status !== "pending" ? { [tab]: Math.max(0, (previous.counts[tab] ?? 1) - 1) } : {}),
        },
      };
      writeCache<Payload>(key, next);
      setData(next);
    }

    try {
      await api(`/api/requisitions/${row.id}`, { method: "PATCH", json: { status, note } });
      toast.push({
        title:
          status === "approved"
            ? `${row.reqNo} approved`
            : status === "received"
              ? `${row.reqNo} received into stock`
              : `${row.reqNo} rejected`,
        description:
          status === "received"
            ? `${row.approvedQty || row.requestedQty} ${row.unit} of ${row.productName} added to inventory.`
            : status === "approved"
              ? "Warehouse can now pick this against the next delivery."
              : "The requester sees the reason on their copy.",
      });
      setDecision(null);
      setDecisionNote("");
      invalidate("requisitions");
      invalidate("products");
      invalidate("dash");
      invalidate("reports");
    } catch (err) {
      if (previous) writeCache<Payload>(key, previous);
      toast.push({ title: "Action failed", description: err instanceof Error ? err.message : "", variant: "error" });
    } finally {
      setActing(null);
    }
  }

  async function submit() {
    if (!form.productId) {
      setFormError("Choose which SKU the team needs");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/api/requisitions/${editing.id}`, {
          method: "PUT",
          json: { ...form, requestedQty: Number(form.requestedQty) },
        });
        toast.push({ title: "Requisition updated", description: `${editing.reqNo} now asks for ${form.requestedQty} units.` });
      } else {
        await api("/api/requisitions", { json: { ...form, requestedQty: Number(form.requestedQty) } });
        toast.push({ title: "Requisition raised", description: "It is now queued for approval." });
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      invalidate("requisitions");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    const previous = readCache<Payload>(key);
    if (previous) {
      const next = { ...previous, rows: previous.rows.filter((r) => r.id !== target.id) };
      writeCache<Payload>(key, next);
      setData(next);
    }
    setConfirmDelete(null);
    try {
      await api(`/api/requisitions/${target.id}`, { method: "DELETE" });
      toast.push({ title: "Requisition deleted", description: `${target.reqNo} is gone from the queue.` });
      invalidate("requisitions");
    } catch (err) {
      if (previous) writeCache<Payload>(key, previous);
      toast.push({ title: "Delete failed", description: err instanceof Error ? err.message : "", variant: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Requisitions"
        subtitle="Restock requests from the van, warehouse and counter"
        actions={
          <Button
            size="sm"
            icon={<IconPlus className="size-4" />}
            onClick={() => {
              setEditing(null);
              setForm({ ...emptyForm, requester: "" });
              setFormError(null);
              setOpen(true);
            }}
          >
            Raise request
          </Button>
        }
      />

      <div className="sticky top-14 z-20 -mx-3 space-y-2 bg-paper/85 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search REQ number, item or requester" className="pl-9" />
          </div>
        </div>
        <div className="vf-scroll-hide flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`vf-press flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                tab === t.value ? "border-transparent bg-pine text-paper" : "border-hairline bg-surface text-ink-2 hover:border-ink/25"
              }`}
            >
              {t.label}
              <span className={`vf-num rounded-full px-1.5 text-[10.5px] ${tab === t.value ? "bg-white/18" : "bg-paper-2 text-muted"}`}>
                {loading && !data ? "·" : (counts[t.value] ?? 0)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {loading && !data ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconClipboard className="size-6" />}
          title={q ? "Nothing matches that search" : tab === "pending" ? "Queue is clear" : "No requests in this state"}
          description={
            tab === "pending"
              ? "Every restock request has been actioned. Raise one when a SKU drops near its reorder point."
              : "Switch tabs or raise a new requisition for the items you need on the next run."
          }
          action={
            <Button size="sm" onClick={() => setOpen(true)} icon={<IconPlus className="size-4" />}>
              Raise request
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {rows.map((r, i) => {
            const overdue = r.neededBy && r.neededBy < todayISO() && r.status !== "received" && r.status !== "rejected";
            return (
              <li key={r.id} className="vf-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <Card interactive className="overflow-hidden">
                  <div className="flex items-start gap-3 p-3.5">
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-[13px] ${
                        r.status === "received" ? "bg-bright-soft text-pine" : r.status === "rejected" ? "bg-clay-soft text-clay" : r.status === "approved" ? "bg-steel-soft text-steel" : "bg-amber-soft text-[#8a5a11]"
                      }`}
                    >
                      {r.status === "received" ? <IconPackageCheck className="size-5" /> : r.status === "approved" ? <IconTruck className="size-5" /> : r.status === "rejected" ? <IconX className="size-5" /> : <IconClock className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="vf-num text-[12px] font-bold tracking-tight text-muted">{r.reqNo}</p>
                        <Badge tone={PRIORITY_TONE[r.priority] ?? "neutral"}>{r.priority}</Badge>
                        {overdue ? <Badge tone="bad" dot>overdue</Badge> : null}
                      </div>
                      <p className="vf-display mt-1 truncate text-[14.5px] font-bold text-ink">{r.productName}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {r.department} · {r.requester || "unassigned"} · raised {relativeTime(r.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="vf-num text-[16px] font-bold text-ink">
                        {r.requestedQty}
                        <span className="text-[11px] font-medium text-muted"> {r.unit}</span>
                      </p>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {r.status === "received" ? `+${r.approvedQty} in` : r.status === "rejected" ? "0 approved" : r.approvedQty ? `${r.approvedQty} ok'd` : "awaiting"}
                      </p>
                    </div>
                  </div>

                  {r.notes || r.decisionNote ? (
                    <p className="border-t border-hairline/70 bg-paper/50 px-3.5 py-2 text-[12px] leading-relaxed text-ink-2">
                      {r.notes}
                      {r.decisionNote ? <span className="mt-1 block text-muted">Decision: {r.decisionNote}{r.decidedBy ? ` — ${r.decidedBy}` : ""}</span> : null}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline bg-surface px-3.5 py-2.5">
                    <span className="mr-auto flex items-center gap-1 text-[11.5px] text-muted">
                      <IconAlert className={`size-3.5 ${overdue ? "text-clay" : ""}`} />
                      needed {r.neededBy ? formatDate(r.neededBy) : "unspecified"}
                    </span>
                    {r.status === "pending" ? (
                      <>
                        <Button size="sm" variant="outline" loading={acting === r.id} onClick={() => { setDecision({ row: r, action: "rejected" }); setDecisionNote(""); }}>
                          Decline
                        </Button>
                        <Button size="sm" loading={acting === r.id} onClick={() => act(r, "approved")} icon={<IconCheck className="size-4" />}>
                          Approve
                        </Button>
                      </>
                    ) : null}
                    {r.status === "approved" ? (
                      <Button size="sm" loading={acting === r.id} onClick={() => act(r, "received")} icon={<IconPackageCheck className="size-4" />}>
                        Receive into stock
                      </Button>
                    ) : null}
                    {r.status === "rejected" || r.status === "received" ? (
                      <Button size="sm" variant="outline" onClick={() => act(r, "pending", "Reopened for a second look")}>
                        Reopen
                      </Button>
                    ) : null}
                    <IconButton
                      label="Edit request"
                      className="size-8"
                      onClick={() => {
                        setEditing(r);
                        setForm({
                          productId: String(r.productId ?? ""),
                          requestedQty: String(r.requestedQty),
                          department: r.department,
                          requester: r.requester,
                          priority: r.priority,
                          neededBy: r.neededBy ?? todayISO(),
                          notes: r.notes,
                        });
                        setFormError(null);
                        setOpen(true);
                      }}
                    >
                      <IconPencil className="size-4" />
                    </IconButton>
                    <IconButton label="Delete request" tone="danger" className="size-8" onClick={() => setConfirmDelete(r)}>
                      <IconX className="size-4" />
                    </IconButton>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.reqNo}` : "Raise a requisition"}
        description="Requests route to the stock controller; approvals can be received straight into inventory"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submit}>
              {editing ? "Save request" : "Send for approval"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Item" className="sm:col-span-2" error={formError ?? undefined}>
            <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">Select a SKU…</option>
              {(products.data?.rows ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.stock} {p.unit} on hand
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" hint={form.productId ? `on hand: ${products.data?.rows.find((p) => String(p.id) === form.productId)?.stock ?? 0}` : undefined}>
            <div className="flex items-center gap-2">
              <Stepper
                value={Number(form.requestedQty) || 1}
                min={1}
                max={5000}
                onChange={(v) => setForm({ ...form, requestedQty: String(v) })}
              />
              <Input inputMode="numeric" value={form.requestedQty} onChange={(e) => setForm({ ...form, requestedQty: e.target.value.replace(/\D/g, "") || "1" })} className="vf-num w-20" />
            </div>
          </Field>
          <Field label="Needed by">
            <Input type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} className="vf-num" />
          </Field>
          <Field label="Department">
            <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              {["Field Sales", "Warehouse", "Van Route 3", "Cold Chain", "Retail Counter"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {["low", "normal", "high", "urgent"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Requester" className="sm:col-span-2">
            <Input value={form.requester} onChange={(e) => setForm({ ...form, requester: e.target.value })} placeholder="Who is asking?" />
          </Field>
          <Field label="Justification" className="sm:col-span-2">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Shelf-empty risk on Saturday promos; two vans already short." />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={!!decision}
        onClose={() => setDecision(null)}
        title={`Decline ${decision?.row.reqNo ?? ""}`}
        description="A reason keeps the field team from re-raising the same request"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => decision && act(decision.row, "rejected", decisionNote || "Deferred to the next buying cycle")}
            >
              Decline request
            </Button>
          </>
        }
      >
        <Field label="Reason">
          <Textarea rows={3} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Supplier lead time is 6 days — hold until the Monday drop." />
        </Field>
      </Sheet>

      <ConfirmSheet
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.reqNo ?? ""}?`}
        body="The request disappears from the queue for everyone. Stock is not affected — this only removes the paperwork."
        confirmLabel="Delete request"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

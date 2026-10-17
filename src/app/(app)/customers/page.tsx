"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronRight, IconPencil, IconPhone, IconPlus, IconSearch, IconTrash, IconUsers } from "@/components/icons";
import {
  Avatar,
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
  Meter,
  Money,
  PageHeader,
  Select,
  Sheet,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, invalidate, readCache, useDebounced, useResource, writeCache } from "@/lib/client";
import { centsToUsd, formatDate, formatNumber, usdToCents } from "@/lib/format";
import type { CustomerRow } from "@/lib/types";

type Payload = { rows: CustomerRow[] };

const SEGMENTS = ["Retail", "Wholesale", "Key Account"];
const emptyForm = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  area: "",
  segment: "Retail",
  creditLimit: "5000",
};

export default function CustomersPage() {
  const toast = useToast();
  const [rawQuery, setRawQuery] = useState("");
  const q = useDebounced(rawQuery.trim());
  const [segment, setSegment] = useState("all");
  const key = `customers:${q}:${segment}`;
  const { data, loading, error, refetch } = useResource<Payload>(key, `/api/customers?q=${encodeURIComponent(q)}`);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CustomerRow | null>(null);

  const all = data?.rows ?? [];
  const rows = segment === "all" ? all : all.filter((c) => c.segment === segment);
  const totals = {
    lifetime: all.reduce((s, c) => s + (c.lifetimeCents ?? 0), 0),
    outstanding: all.reduce((s, c) => s + c.balanceCents, 0),
    accounts: all.length,
  };

  async function submit() {
    if (!form.name.trim()) {
      setFormError("Trade name is required");
      return;
    }
    setBusy(true);
    setFormError(null);
    const payload = { ...form, creditLimitCents: usdToCents(form.creditLimit) };
    try {
      if (editing) await api(`/api/customers/${editing.id}`, { method: "PUT", json: payload });
      else await api("/api/customers", { json: payload });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.push({ title: editing ? "Account updated" : "Account added", description: `${form.name} saved to the book.` });
      invalidate("customers");
      invalidate("dash");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the account");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm) return;
    const target = confirm;
    const previous = readCache<Payload>(key);
    if (previous) {
      const next = { rows: previous.rows.filter((c) => c.id !== target.id) };
      writeCache<Payload>(key, next);
    }
    setConfirm(null);
    try {
      await api(`/api/customers/${target.id}`, { method: "DELETE" });
      toast.push({ title: "Account removed", description: `${target.name} deleted; historic invoices were kept.` });
      invalidate("customers");
    } catch (err) {
      if (previous) writeCache<Payload>(key, previous);
      toast.push({ title: "Delete failed", description: err instanceof Error ? err.message : "", variant: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle="Trade accounts, credit exposure and lifetime value"
        actions={
          <Button
            size="sm"
            icon={<IconPlus className="size-4" />}
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setFormError(null);
              setOpen(true);
            }}
          >
            New account
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Accounts", value: formatNumber(totals.accounts) },
            { label: "Lifetime revenue", value: centsToUsd(totals.lifetime) },
            { label: "Owed on credit", value: centsToUsd(totals.outstanding) },
          ].map((s) => (
            <Card key={s.label} className="p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">{s.label}</p>
              <p className="vf-num mt-1 text-[18px] font-bold text-ink">{loading ? "—" : s.value}</p>
            </Card>
          ))}
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search account, contact or area" className="pl-9" />
        </div>
        <div className="vf-scroll-hide flex gap-1.5 overflow-x-auto">
          <Chip active={segment === "all"} onClick={() => setSegment("all")} tone="dark">
            All
          </Chip>
          {SEGMENTS.map((s) => (
            <Chip key={s} active={segment === s} onClick={() => setSegment(s)}>
              {s}
            </Chip>
          ))}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {loading && !data ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="size-6" />}
          title={q ? "No account matches that search" : "Your customer book is empty"}
          description="Add the shops and wholesalers you call on — invoices, credit limits and balances hang off these records."
          action={<Button size="sm" onClick={() => setOpen(true)}>Add account</Button>}
        />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c, i) => {
            const usage = c.creditUsagePct ?? 0;
            return (
              <li key={c.id} className="vf-rise" style={{ animationDelay: `${Math.min(i, 12) * 26}ms` }}>
                <Card interactive className="group h-full p-3.5">
                  <div className="flex items-start gap-3">
                    <Avatar initials={c.name.slice(0, 2).toUpperCase()} hue={140 + (c.id * 23) % 200} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="vf-display truncate text-[14.5px] font-bold text-ink">{c.name}</p>
                      <p className="truncate text-[11.5px] text-muted">
                        {c.contactName || "—"} · {c.area}
                      </p>
                    </div>
                    <Badge tone={c.segment === "Key Account" ? "plum" : c.segment === "Wholesale" ? "info" : "neutral"}>{c.segment}</Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-[12px] bg-paper/70 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Lifetime</p>
                      <p className="vf-num text-[14px] font-bold text-pine">{centsToUsd(c.lifetimeCents ?? 0)}</p>
                    </div>
                    <div className="rounded-[12px] bg-paper/70 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Orders</p>
                      <p className="vf-num text-[14px] font-bold text-ink">
                        {formatNumber(c.orders ?? 0)}
                        {c.lastOrder ? <span className="text-[10.5px] font-medium text-muted"> · {formatDate(c.lastOrder)}</span> : null}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Credit used</p>
                      <p className="vf-num text-[12px] font-semibold text-ink-2">
                        {centsToUsd(c.balanceCents)} / {centsToUsd(c.creditLimitCents)}
                      </p>
                    </div>
                    <Meter value={usage} max={100} tone={usage > 85 ? "clay" : usage > 55 ? "amber" : "bright"} className="mt-1.5" />
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}
                        className="vf-press inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-hairline bg-surface text-[12.5px] font-semibold text-ink-2 transition hover:border-ink/25 hover:text-ink"
                      >
                        <IconPhone className="size-3.5" /> Call
                      </a>
                    ) : null}
                    <Link
                      href={`/sales?customer=${encodeURIComponent(c.name)}`}
                      className="vf-press inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[10px] bg-pine text-[12.5px] font-semibold text-paper transition hover:bg-pine-2"
                    >
                      Invoices <IconChevronRight className="size-3.5" />
                    </Link>
                    <IconButton
                      label={`Edit ${c.name}`}
                      className="size-8"
                      onClick={() => {
                        setEditing(c);
                        setForm({
                          name: c.name,
                          contactName: c.contactName,
                          phone: c.phone,
                          email: c.email,
                          area: c.area,
                          segment: c.segment,
                          creditLimit: (c.creditLimitCents / 100).toFixed(2),
                        });
                        setFormError(null);
                        setOpen(true);
                      }}
                    >
                      <IconPencil className="size-4" />
                    </IconButton>
                    <IconButton label={`Delete ${c.name}`} tone="danger" className="size-8" onClick={() => setConfirm(c)}>
                      <IconTrash className="size-4" />
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
        title={editing ? `Edit ${editing.name}` : "New trade account"}
        description="Credit limits gate how much a customer can take on account"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={submit}>
              {editing ? "Save account" : "Add account"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Trade name" className="sm:col-span-2" error={formError ?? undefined}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Junction Mini-Mart" />
          </Field>
          <Field label="Contact">
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Priya Raman" />
          </Field>
          <Field label="Area">
            <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Eastside" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (415) 555-0142" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="orders@junction.example" />
          </Field>
          <Field label="Segment">
            <Select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Credit limit">
            <Money label="Credit limit" value={form.creditLimit} onChange={(v) => setForm({ ...form, creditLimit: v })} />
          </Field>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!confirm}
        title={`Delete ${confirm?.name ?? "account"}?`}
        body="The account is removed from the book. Invoices already raised keep their customer name so historical reporting is unaffected."
        confirmLabel="Delete account"
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
      />
    </div>
  );
}

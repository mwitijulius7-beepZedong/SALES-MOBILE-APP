"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  IconAlert,
  IconArrowDown,
  IconBox,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconRefresh,
  IconTrash,
  IconWallet,
} from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  PageHeader,
  SectionTitle,
  Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, invalidate, useResource } from "@/lib/client";
import { centsToUsd, formatDateLong, formatNumber, pct, relativeTime } from "@/lib/format";
import type { SaleRow } from "@/lib/types";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = Number(params?.id);
  const { data, loading, error, refetch } = useResource<{ row: SaleRow }>(`sale:${id}`, `/api/sales/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sale = data?.row;

  async function setStatus(status: "completed" | "pending" | "refunded") {
    setBusy(status);
    try {
      const res = await api<{ row: SaleRow }>(`/api/sales/${id}`, { method: "PATCH", json: { status } });
      toast.push({
        title: status === "refunded" ? "Refund recorded" : status === "completed" ? "Marked settled" : "Moved to pending",
        description:
          status === "completed"
            ? "Stock has been reserved against this invoice."
            : status === "refunded"
              ? "Units were returned to inventory and the ledger reversed."
              : "Stock released back on-hand until you settle.",
      });
      invalidate(`sale:${id}`);
      invalidate("sales");
      invalidate("products");
      invalidate("dash");
      void res;
    } catch (err) {
      toast.push({ title: "Update failed", description: err instanceof Error ? err.message : "", variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(`/api/sales/${id}`, { method: "DELETE" });
      toast.push({ title: "Invoice voided", description: `${sale?.invoiceNo ?? "Sale"} removed and stock restored.` });
      invalidate("sales");
      invalidate("products");
      invalidate("dash");
      router.push("/sales");
    } catch (err) {
      toast.push({ title: "Could not void", description: err instanceof Error ? err.message : "", variant: "error" });
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Invoice" subtitle="Lookup failed" />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (loading || !sale) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      </div>
    );
  }

  const margin = sale.totalCents - sale.costCents;

  return (
    <div className="space-y-4">
      <Link href="/sales" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted transition hover:text-pine">
        All sales
        <IconChevronRight className="size-3.5 rotate-180" />
      </Link>

      <PageHeader
        title={sale.invoiceNo}
        subtitle={`${formatDateLong(sale.saleDate)} · ${sale.channel} · raised by ${sale.soldByName}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()} icon={<IconWallet className="size-4" />}>
              Print
            </Button>
            {sale.status === "pending" ? (
              <Button size="sm" loading={busy === "completed"} onClick={() => setStatus("completed")} icon={<IconCheck className="size-4" />}>
                Settle
              </Button>
            ) : null}
            {sale.status === "completed" ? (
              <Button size="sm" variant="amber" loading={busy === "refunded"} onClick={() => setStatus("refunded")} icon={<IconRefresh className="size-4" />}>
                Refund
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Void invoice">
              <IconTrash className="size-4 text-clay" />
            </Button>
          </>
        }
      />

      <section className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-paper/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge tone={sale.status === "completed" ? "good" : sale.status === "pending" ? "warn" : "bad"} dot>
                {sale.status}
              </Badge>
              <span className="text-[12.5px] font-semibold text-ink-2">{sale.customerName}</span>
            </div>
            <span className="text-[11.5px] text-muted">
              created {relativeTime(sale.createdAt)} · {sale.paymentMethod}
            </span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-2">Line</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Unit</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/70">
              {(sale.items ?? []).map((line) => (
                <tr key={`${line.productId}-${line.sku}`} className="transition hover:bg-paper/70">
                  <td className="px-4 py-2.5">
                    <p className="text-[13.5px] font-semibold text-ink">{line.productName}</p>
                    <p className="vf-num text-[11px] text-muted">
                      {line.sku} · {line.unit}
                    </p>
                  </td>
                  <td className="vf-num px-2 py-2.5 text-right text-[13.5px] font-bold text-ink">{formatNumber(line.qty)}</td>
                  <td className="vf-num px-2 py-2.5 text-right text-[12.5px] text-ink-2">{centsToUsd(line.unitPriceCents)}</td>
                  <td className="vf-num px-4 py-2.5 text-right text-[13.5px] font-bold text-ink">{centsToUsd(line.lineTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1.5 border-t border-hairline bg-paper/50 px-4 py-3">
            {[
              ["Subtotal", sale.subtotalCents],
              ["Discount", -sale.discountCents],
              ["VAT", sale.taxCents],
            ].map(([label, value]) => (
              <p key={label as string} className="flex justify-between text-[12.5px] text-muted">
                <span>{label}</span>
                <span className="vf-num font-semibold text-ink-2">
                  {(value as number) < 0 ? "−" : ""}
                  {centsToUsd(Math.abs(value as number))}
                </span>
              </p>
            ))}
            <p className="flex items-end justify-between border-t border-dashed border-hairline pt-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Total</span>
              <span className="vf-num text-[24px] font-bold leading-none text-pine">{centsToUsd(sale.totalCents)}</span>
            </p>
          </div>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <SectionTitle eyebrow="Profitability" title="Margin on this drop" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-paper/70 p-3">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Gross profit</p>
                <p className="vf-num mt-1 text-[19px] font-bold text-bright">{centsToUsd(margin)}</p>
              </div>
              <div className="rounded-[12px] bg-paper/70 p-3">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Margin rate</p>
                <p className="vf-num mt-1 text-[19px] font-bold text-ink">{pct(margin, sale.totalCents).toFixed(1)}%</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[12.5px] text-muted">
              <p className="flex items-center justify-between">
                <span>Cost of goods</span>
                <span className="vf-num font-semibold text-ink-2">{centsToUsd(sale.costCents)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Units shipped</span>
                <span className="vf-num font-semibold text-ink-2">{formatNumber(sale.totalQty)}</span>
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle eyebrow="Stock effect" title="Where these units went" />
            <ul className="mt-3 space-y-2">
              {(sale.items ?? []).map((line) => (
                <li key={`mov-${line.productId}`} className="flex items-center gap-2.5 rounded-[12px] border border-hairline bg-paper/50 p-2.5">
                  <span className={`grid size-8 place-items-center rounded-[10px] ${sale.status === "completed" ? "bg-clay-soft text-clay" : "bg-bright-soft text-pine"}`}>
                    {sale.status === "completed" ? <IconArrowDown className="size-4" /> : <IconBox className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">{line.productName}</span>
                    <span className="block text-[11px] text-muted">
                      {sale.status === "completed" ? `${line.qty} ${line.unit} reserved` : `${line.qty} ${line.unit} back on shelf`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {sale.note ? (
            <Card className="p-4">
              <SectionTitle eyebrow="Driver note" title="Recorded on the route" />
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{sale.note}</p>
            </Card>
          ) : null}

          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-amber-soft text-[#8a5a11]">
                <IconClock className="size-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-ink">Tender: {sale.paymentMethod}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  {sale.paymentMethod === "credit"
                    ? "Balance sits on the customer account until collected — watch the receivables strip on Reports."
                    : "Money is in hand; expenses for this route still net against it."}
                </p>
                <Link href="/customers" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-pine hover:underline">
                  Open customer book <IconChevronRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </Card>

          <Card className="border-amber/35 bg-amber-soft/40 p-4">
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-amber/25 text-[#8a5a11]">
                <IconAlert className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-ink">Reversing this invoice restocks every line</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                  Refund keeps the paperwork and returns the units to the shelf. Void deletes the invoice outright —
                  the audit trail loses it, so prefer refunds on settled routes.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sale.status !== "refunded" ? (
                <Button size="sm" variant="amber" onClick={() => setStatus("refunded")} loading={busy === "refunded"}>
                  Refund &amp; restock
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStatus("completed")} loading={busy === "completed"}>
                  Re-settle invoice
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}>
                Void invoice
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <ConfirmSheet
        open={confirmDelete}
        busy={busy === "delete"}
        title={`Void ${sale.invoiceNo}?`}
        body="This deletes the invoice and every line on it, then returns the units to inventory. Stock reports for this date will restate immediately."
        confirmLabel="Void invoice"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </div>
  );
}

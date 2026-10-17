export const CURRENCY = "USD";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 2,
});

const moneyCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

export function centsToUsd(cents: number) {
  return money.format((cents ?? 0) / 100);
}

export function usdCompact(cents: number) {
  return moneyCompact.format((cents ?? 0) / 100);
}

export function usdToCents(input: string | number | null | undefined) {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = (input ?? "").toString().replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n ?? 0);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatDateLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function relativeTime(value: string | Date) {
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

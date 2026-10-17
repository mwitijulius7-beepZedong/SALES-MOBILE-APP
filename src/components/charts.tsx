"use client";

import { useMemo, useState } from "react";
import { centsToUsd, formatNumber, usdCompact } from "@/lib/format";

/* ------------------------------ Trend bars ------------------------------- */

export type TrendPoint = { date: string; revenue: number; orders: number; expenses: number };

export function TrendChart({ points, height = 168 }: { points: TrendPoint[]; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => Math.max(p.revenue, p.expenses)));
  const step = 100 / Math.max(1, points.length);

  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-t border-dashed border-hairline/80" />
          ))}
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="relative w-full"
          style={{ height }}
          role="img"
          aria-label="Revenue versus expenses for the last two weeks"
        >
          {points.map((p, i) => {
            const revenuePct = (p.revenue / max) * 74;
            const expensePct = (p.expenses / max) * 74;
            const x = i * step + step / 2;
            const isActive = active === i;
            return (
              <g key={p.date}>
                <rect
                  x={x - step * 0.3}
                  y={80 - revenuePct}
                  width={step * 0.42}
                  height={Math.max(1.2, revenuePct)}
                  rx={0.8}
                  fill={isActive ? "#12433a" : "#1fa97c"}
                  opacity={active === null || isActive ? 1 : 0.45}
                  style={{ transition: "all 260ms cubic-bezier(0.2,0.8,0.2,1)", transformOrigin: "bottom" }}
                />
                <rect
                  x={x + step * 0.02}
                  y={80 - expensePct}
                  width={step * 0.24}
                  height={Math.max(1, expensePct)}
                  rx={0.6}
                  fill="#e9a23b"
                  opacity={active === null || isActive ? 0.9 : 0.35}
                  style={{ transition: "all 260ms cubic-bezier(0.2,0.8,0.2,1)" }}
                />
                <rect
                  x={i === 0 ? 0 : x - step / 2}
                  y={0}
                  width={step}
                  height={100}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(isActive ? null : i)}
                  style={{ cursor: "pointer" }}
                />
              </g>
            );
          })}
          <line x1="0" y1="80" x2="100" y2="80" stroke="#e2ddd2" strokeWidth="0.6" />
        </svg>
        {active !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-xl border border-hairline bg-surface px-2.5 py-2 text-left shadow-[0_16px_30px_-22px_rgba(20,24,27,0.8)]"
            style={{ left: `${active * step + step / 2}%` }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              {new Date(`${points[active].date}T12:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
            <p className="vf-num mt-1 text-[14px] font-bold text-pine">{centsToUsd(points[active].revenue)}</p>
            <p className="text-[11.5px] text-muted">
              {points[active].orders} orders · {usdCompact(points[active].expenses)} out
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between px-0.5 text-[10.5px] font-medium text-muted/80">
        {points.map((p, i) =>
          i % Math.ceil(points.length / 5) === 0 || i === points.length - 1 ? (
            <span key={p.date}>
              {new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Donut --------------------------------- */

export function Donut({
  slices,
  caption,
  centerValue,
  size = 132,
}: {
  slices: { label: string; value: number; color: string }[];
  caption?: string;
  centerValue?: string;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = useMemo(() => slices.reduce((s, x) => s + x.value, 0) || 1, [slices]);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const shares = slices.map((slice) => (slice.value / total) * circumference);
  const arcs = slices.map((slice, i) => ({
    ...slice,
    share: shares[i],
    start: shares.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#ece8de" strokeWidth="13" />
          {arcs.map((arc, i) => (
            <circle
              key={`${arc.label}-${i}`}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={hover === i ? 16 : 13}
              strokeDasharray={`${Math.max(0, arc.share - 2)} ${circumference}`}
              strokeDashoffset={-arc.start}
              strokeLinecap="round"
              opacity={hover === null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
              style={{ transition: "all 260ms ease", cursor: "pointer" }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="vf-num text-[17px] font-bold text-ink">
              {hover !== null ? `${Math.round((slices[hover].value / total) * 100)}%` : (centerValue ?? usdCompact(total))}
            </p>
            <p className="max-w-[76px] truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              {hover !== null ? slices[hover].label : (caption ?? "total")}
            </p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[13px] transition ${hover === i ? "bg-paper" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate capitalize text-ink-2">{s.label}</span>
            </span>
            <span className="vf-num shrink-0 font-semibold text-ink">{usdCompact(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------- Spark line ------------------------------- */

export function MiniSpark({ values, tone = "#1fa97c" }: { values: number[]; tone?: string }) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 100;
    const y = 26 - ((v - min) / Math.max(1, max - min)) * 22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M${points.join(" L")}`;
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full">
      <path d={`${d} L100,30 L0,30 Z`} fill={tone} opacity="0.12" />
      <path d={d} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" className="vf-draw" />
    </svg>
  );
}

/* ------------------------------ Ranked bars ------------------------------ */

export function RankBars({
  rows,
  tone = "#12433a",
}: {
  rows: { label: string; value: number; sub?: string }[];
  tone?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="group">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">
              <span className="vf-num mr-1.5 text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              {r.label}
            </span>
            <span className="vf-num shrink-0 text-[13px] font-bold text-ink">{usdCompact(r.value)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out group-hover:brightness-110"
                style={{ width: `${(r.value / max) * 100}%`, background: tone }}
              />
            </div>
            <span className="vf-num w-16 text-right text-[11.5px] text-muted">{r.sub ?? formatNumber(r.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

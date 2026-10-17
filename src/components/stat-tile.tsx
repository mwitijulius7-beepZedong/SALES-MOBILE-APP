"use client";

import type { ReactNode } from "react";
import { IconArrowDown, IconArrowUp } from "@/components/icons";
import { MiniSpark } from "@/components/charts";
import { Card } from "@/components/ui";

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  footer,
  spark,
  tone = "pine",
  icon,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  footer?: ReactNode;
  spark?: number[];
  tone?: "pine" | "amber" | "steel" | "clay";
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const accent = { pine: "#12433a", amber: "#e9a23b", steel: "#2e6fa7", clay: "#c4453b" }[tone];
  const up = (delta ?? 0) >= 0;
  return (
    <Card
      interactive
      className={`group relative overflow-hidden p-4 ${onClick ? "cursor-pointer" : ""}`}
      {...(onClick ? { onClick } : {})}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.85 }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
        {icon ? (
          <span className="grid size-8 place-items-center rounded-[10px] bg-paper text-ink-2 transition group-hover:bg-paper-2">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="vf-num mt-2.5 flex items-baseline gap-1 text-[26px] font-bold leading-none text-ink">
        {value}
        {unit ? <span className="text-[13px] font-semibold text-muted">{unit}</span> : null}
      </p>
      {delta !== undefined ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
          <span
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${up ? "bg-bright-soft text-pine" : "bg-clay-soft text-clay"}`}
          >
            {up ? <IconArrowUp className="size-3" /> : <IconArrowDown className="size-3" />}
            {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
            {Math.abs(delta) < 100 ? "%" : ""}
          </span>
          <span className="text-muted">{deltaLabel ?? "vs previous"}</span>
        </p>
      ) : null}
      {spark && spark.length > 1 ? (
        <div className="-mx-1 mt-2 opacity-90">
          <MiniSpark values={spark} tone={accent} />
        </div>
      ) : null}
      {footer ? <div className="mt-2.5 text-[12px] text-muted">{footer}</div> : null}
    </Card>
  );
}

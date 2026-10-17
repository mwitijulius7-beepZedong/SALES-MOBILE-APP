"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { IconCheck, IconMinus, IconPlus, IconX } from "@/components/icons";
import { useDismissable } from "@/lib/client";

/* --------------------------------- Button -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "amber" | "dark";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-pine text-[#f2fbf7] hover:bg-pine-2 shadow-[0_10px_22px_-14px_rgba(18,67,58,0.85)]",
  dark: "bg-ink text-paper hover:bg-ink/90",
  outline: "border border-hairline bg-surface text-ink hover:border-ink/25 hover:bg-paper",
  ghost: "text-ink-2 hover:bg-paper-2 hover:text-ink",
  danger: "bg-clay text-white hover:bg-[#a8382f]",
  amber: "bg-amber text-[#2b1d05] hover:bg-[#dd9530]",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-[13.5px] gap-2 rounded-[12px]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-[14px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  block,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`vf-press inline-flex select-none items-center justify-center font-semibold tracking-[-0.01em] disabled:pointer-events-none disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
    >
      {loading ? (
        <span
          className="size-3.5 animate-spin rounded-full border-[2px] border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  tone = "default",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "default" | "danger" | "solid" }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={`vf-press grid size-9 place-items-center rounded-[11px] border transition ${
        tone === "danger"
          ? "border-clay/25 bg-clay-soft/60 text-clay hover:bg-clay-soft"
          : tone === "solid"
            ? "border-pine bg-pine text-paper hover:bg-pine-2"
            : "border-hairline bg-surface text-ink-2 hover:border-ink/25 hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Layout -------------------------------- */

export function Card({
  children,
  className = "",
  interactive,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "section" | "li" | "article";
}) {
  return (
    <As className={`vf-card ${interactive ? "vf-card-hover cursor-pointer" : ""} ${className}`}>{children}</As>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  hint,
  right,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        ) : null}
        <h2 className="vf-display truncate text-[17px] font-semibold text-ink sm:text-[19px]">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="vf-rise space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="vf-display text-[26px] font-bold leading-tight text-ink sm:text-[32px]">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13px] text-muted sm:text-sm">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/* --------------------------------- Inputs -------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">{label}</span>
        {hint ? <span className="text-[11.5px] text-muted/80">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-[12px] font-medium text-clay">{error}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-[12px] border bg-surface px-3 py-2.5 text-[15px] text-ink transition placeholder:text-muted/60 focus:border-bright focus:ring-0 disabled:opacity-60";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${inputBase} border-hairline ${className}`} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${inputBase} border-hairline min-h-[84px] resize-y ${className}`} />;
}

export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={`${inputBase} appearance-none border-hairline pr-9 ${className}`}
      />
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path d="m6 9.5 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Money({
  label,
  value,
  onChange,
  placeholder = "0.00",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-muted">$</span>
      <Input
        aria-label={label}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
        className="vf-num pl-6"
      />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "size-7" : "size-9";
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-hairline bg-paper p-1">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`vf-press grid ${dim} place-items-center rounded-[9px] bg-surface text-ink-2 shadow-sm transition hover:text-ink disabled:opacity-40`}
        disabled={value <= min}
      >
        <IconMinus className="size-4" />
      </button>
      <input
        aria-label="Quantity"
        value={value}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
          onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : min);
        }}
        className={`vf-num w-11 border-0 bg-transparent text-center text-[14px] font-semibold text-ink focus:outline-none ${size === "sm" ? "text-[13px]" : ""}`}
      />
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`vf-press grid ${dim} place-items-center rounded-[9px] bg-pine text-paper shadow-sm transition hover:bg-pine-2 disabled:opacity-40`}
        disabled={value >= max}
      >
        <IconPlus className="size-4" />
      </button>
    </div>
  );
}

/* --------------------------------- Chips --------------------------------- */

export function Chip({
  active,
  children,
  onClick,
  tone = "light",
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  tone?: "light" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`vf-press whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
        active
          ? tone === "dark"
            ? "border-transparent bg-ink text-paper"
            : "border-transparent bg-pine text-paper"
          : "border-hairline bg-surface text-ink-2 hover:border-ink/25 hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="vf-scroll-hide flex gap-1 overflow-x-auto rounded-[13px] border border-hairline bg-paper p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`vf-press relative flex-1 whitespace-nowrap rounded-[10px] px-3 font-semibold transition ${
              size === "sm" ? "py-1.5 text-[12px]" : "py-2 text-[13px]"
            } ${active ? "bg-surface text-ink shadow-[0_6px_16px_-12px_rgba(20,24,27,0.7)]" : "text-muted hover:text-ink-2"}`}
          >
            {o.label}
            {o.badge !== undefined && o.badge > 0 ? (
              <span
                className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-bright-soft text-pine" : "bg-paper-2 text-muted"}`}
              >
                {o.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info" | "plum";
  dot?: boolean;
}) {
  const map = {
    neutral: "bg-paper-2 text-ink-2 border-hairline",
    good: "bg-bright-soft text-pine border-bright/25",
    warn: "bg-amber-soft text-[#8a5a11] border-amber/30",
    bad: "bg-clay-soft text-clay border-clay/25",
    info: "bg-steel-soft text-steel border-steel/25",
    plum: "bg-[#f0eaf7] text-plum border-plum/25",
  } as const;
  const dotColor = {
    neutral: "bg-muted",
    good: "bg-bright",
    warn: "bg-amber",
    bad: "bg-clay",
    info: "bg-steel",
    plum: "bg-plum",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${map[tone]}`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${dotColor[tone]}`} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------- Skeletons ------------------------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`vf-skeleton ${className}`} />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="vf-card flex items-center gap-3 p-3.5" style={{ opacity: 1 - i * 0.09 }}>
          <Skeleton className="size-10 rounded-[12px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-3 h-2.5 w-24" />
    </Card>
  );
}

/* ------------------------------- Empty state ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="vf-rise vf-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="relative grid size-14 place-items-center rounded-2xl border border-hairline bg-paper text-pine">
        <span className="absolute inset-0 rounded-2xl bg-bright/10 blur-md" aria-hidden />
        <span className="relative">{icon ?? <IconCheck className="size-6" />}</span>
      </div>
      <div>
        <p className="vf-display text-[16px] font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="vf-card flex flex-col items-start gap-3 border-clay/25 bg-clay-soft/40 p-5">
      <p className="vf-display text-[15px] font-semibold text-ink">{message}</p>
      <p className="text-[13px] text-muted">Check that the API is reachable, then try again.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/* ---------------------------------- Sheet --------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useDismissable(open, onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.scrollTo({ top: 0 });
  }, [open]);
  if (!open) return null;
  const widths = { sm: "sm:max-w-[420px]", md: "sm:max-w-[540px]", lg: "sm:max-w-[720px]", xl: "sm:max-w-[900px]" };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/45 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
        style={{ animation: "rise 220ms ease both" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`vf-sheet vf-card relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-[20px] ${widths[size]}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-surface/95 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h3 className="vf-display truncate text-[16px] font-bold text-ink sm:text-[18px]">{title}</h3>
            {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="shrink-0">
            <IconX className="size-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-hairline bg-paper/70 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel = "Delete",
  tone = "danger",
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Keep it
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-2">{body}</p>
    </Sheet>
  );
}

/* --------------------------------- Bars ---------------------------------- */

export function Meter({
  value,
  max,
  tone = "bright",
  className = "",
}: {
  value: number;
  max: number;
  tone?: "bright" | "amber" | "clay" | "steel";
  className?: string;
}) {
  const pctValue = max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;
  const bar = { bright: "bg-bright", amber: "bg-amber", clay: "bg-clay", steel: "bg-steel" }[tone];
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-paper-2 ${className}`}>
      <div
        className={`h-full rounded-full ${bar} transition-[width] duration-700 ease-out`}
        style={{ width: `${pctValue}%` }}
      />
    </div>
  );
}

export function Avatar({ initials, hue = 158, size = 36 }: { initials: string; hue?: number; size?: number }) {
  return (
    <span
      className="vf-display grid shrink-0 place-items-center rounded-[12px] font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(150deg, hsl(${hue} 45% 38%), hsl(${(hue + 38) % 360} 52% 26%))`,
      }}
    >
      {initials}
    </span>
  );
}

/* ------------------------- Accordion-ish disclosure ------------------------ */

const DisclosureCtx = createContext<{ open: boolean; toggle: () => void } | null>(null);

export function Disclosure({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <DisclosureCtx.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      <div data-id={id}>{children}</div>
    </DisclosureCtx.Provider>
  );
}

export function DisclosureTrigger({ children }: { children: ReactNode }) {
  const ctx = useContext(DisclosureCtx)!;
  return (
    <button type="button" onClick={ctx.toggle} className="vf-press w-full text-left">
      {children}
    </button>
  );
}

export function DisclosurePanel({ children }: { children: ReactNode }) {
  const ctx = useContext(DisclosureCtx)!;
  return (
    <div style={{ maxHeight: ctx.open ? 900 : 0, transition: "max-height 320ms ease" }} className="overflow-hidden">
      <div style={{ opacity: ctx.open ? 1 : 0, transition: "opacity 240ms ease" }}>{children}</div>
    </div>
  );
}

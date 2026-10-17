"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconRefresh, IconX } from "@/components/icons";

type Variant = "success" | "error" | "info" | "undo";

export type Toast = {
  id: number;
  title: string;
  description?: string;
  variant?: Variant;
  action?: { label: string; onClick: () => void };
  duration?: number;
};

type Ctx = {
  push: (toast: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<Ctx | null>(null);

const TONES: Record<Variant, { rail: string; icon: string; badge: string }> = {
  success: { rail: "bg-bright", icon: "text-bright", badge: "bg-bright-soft" },
  error: { rail: "bg-clay", icon: "text-clay", badge: "bg-clay-soft" },
  info: { rail: "bg-steel", icon: "text-steel", badge: "bg-steel-soft" },
  undo: { rail: "bg-amber", icon: "text-amber", badge: "bg-amber-soft" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = seq.current++;
      setItems((prev) => [...prev.slice(-3), { ...toast, id }]);
      const timer = setTimeout(() => dismiss(id), toast.duration ?? 4200);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-auto sm:bottom-4 sm:items-end">
        {items.map((t) => {
          const tone = TONES[t.variant ?? "success"];
          return (
            <div
              key={t.id}
              role="status"
              className="vf-toast vf-card pointer-events-auto flex w-full max-w-[420px] items-start gap-3 overflow-hidden p-3 pr-2.5"
            >
              <span className={`absolute left-0 top-0 h-full w-1 ${tone.rail}`} aria-hidden />
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${tone.badge} ${tone.icon}`}>
                {t.variant === "error" ? (
                  <IconAlert className="size-4" />
                ) : t.variant === "undo" ? (
                  <IconRefresh className="size-4" />
                ) : (
                  <IconCheck className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold leading-tight text-ink">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.description}</p>
                ) : null}
                {t.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-hairline bg-paper px-2.5 py-1 text-[12px] font-semibold text-ink transition hover:border-ink/25 hover:bg-paper-2 vf-press"
                  >
                    <IconRefresh className="size-3.5" />
                    {t.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-paper hover:text-ink"
              >
                <IconX className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

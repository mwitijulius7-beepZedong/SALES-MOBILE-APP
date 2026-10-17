"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { IconAlert, IconCheck, IconSpark } from "@/components/icons";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

const DEMO = { email: "demo@vendflow.app", password: "demo1234" };

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState(mode === "login" ? DEMO.email : "");
  const [password, setPassword] = useState(mode === "login" ? DEMO.password : "");
  const [name, setName] = useState("");
  const [territory, setTerritory] = useState("East Loop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        json: { email, password, name, territory },
      });
      toast.push({
        title: mode === "login" ? "Welcome back" : "Account created",
        description: mode === "login" ? "Demo dataset loaded and synced." : "You're signed in as a field rep.",
        variant: "success",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vf-rise space-y-6">
      <div className="flex items-center gap-2.5 lg:hidden">
        <span className="grid size-9 place-items-center rounded-[11px] bg-pine text-bright">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
            <path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4v-9Z" />
            <path d="M8.5 12.5h7" />
          </svg>
        </span>
        <span className="vf-display text-[16px] font-bold tracking-tight text-ink">VendFlow</span>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bright">
          {mode === "login" ? "Sign in" : "Create account"}
        </p>
        <h2 className="vf-display mt-1.5 text-[27px] font-bold leading-tight text-ink">
          {mode === "login" ? "Pick up where the van left off" : "Start tracking route, stock and cash"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {mode === "login"
            ? "Your session persists across devices — inventory, invoices and expenses stay in Postgres."
            : "New reps land in the demo dataset so you can practise before going live on the road."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="vf-card space-y-4 p-5">
        {mode === "register" ? (
          <>
            <Field label="Full name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Whitfield" autoComplete="name" />
            </Field>
            <Field label="Territory" hint="used for routing">
              <Input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="East Loop" />
            </Field>
          </>
        ) : null}

        <Field label="Work email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Password" hint={mode === "register" ? "min 8 characters" : undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </Field>

        {error ? (
          <p className="flex items-start gap-2 rounded-[12px] border border-clay/25 bg-clay-soft/60 p-3 text-[13px] font-medium text-clay">
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" block loading={busy}>
          {mode === "login" ? "Sign in to the workspace" : "Create my workspace"}
        </Button>

        {mode === "login" ? (
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO.email);
              setPassword(DEMO.password);
              setError(null);
            }}
            className="vf-press flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-bright/45 bg-bright-soft/50 py-2.5 text-[13px] font-semibold text-pine transition hover:bg-bright-soft"
          >
            <IconSpark className="size-4" />
            Use the seeded demo account
          </button>
        ) : null}
      </form>

      <div className="flex items-center justify-between gap-3 text-[13px]">
        <p className="text-muted">
          {mode === "login" ? "No account yet?" : "Already onboard?"}{" "}
          <Link
            href={mode === "login" ? "/register" : "/login"}
            className="font-semibold text-pine underline decoration-bright/50 decoration-2 underline-offset-4 hover:decoration-bright"
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </Link>
        </p>
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-bright">
          <IconCheck className="size-4" />
          Data stays local
        </span>
      </div>
    </div>
  );
}

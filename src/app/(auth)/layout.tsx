import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const PROOF = [
  ["45 days", "of trading history loaded"],
  ["30 SKUs", "tracked down to the bin"],
  ["3 reps", "sharing one source of truth"],
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="vf-canvas grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="vf-panel-dark relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(520px 320px at 12% 8%, rgba(31,169,124,0.55), transparent 60%), radial-gradient(420px 300px at 90% 88%, rgba(233,162,59,0.35), transparent 65%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-bright text-pine-2">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4v-9Z" />
                <path d="M8.5 12.5h7" />
              </svg>
            </span>
            <span className="vf-display text-[17px] font-bold tracking-tight">VendFlow</span>
          </div>
          <h1 className="vf-display mt-14 max-w-[15ch] text-[44px] font-bold leading-[1.02] text-white">
            Close the sale. <span className="text-bright">Count the crate.</span> Settle the books.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-white/65">
            One pocket-sized operations desk for route teams: live stock, invoices on the spot, expenses the
            moment they happen, and requisitions that actually get approved.
          </p>
        </div>
        <dl className="relative grid grid-cols-3 gap-3 border-t border-white/10 pt-6">
          {PROOF.map(([value, label]) => (
            <div key={value}>
              <dt className="vf-num text-[19px] font-bold text-white">{value}</dt>
              <dd className="mt-0.5 text-[11.5px] leading-snug text-white/50">{label}</dd>
            </div>
          ))}
        </dl>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[404px]">{children}</div>
      </main>
    </div>
  );
}

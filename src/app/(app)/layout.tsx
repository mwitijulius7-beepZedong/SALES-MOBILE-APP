import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ensureSeeded } from "@/db/seed";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        initials: user.initials,
        hue: user.hue,
        territory: user.territory,
      }}
    >
      {children}
    </AppShell>
  );
}

import { getDashboard } from "@/server/queries";
import { withAuth } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => ({
  ...(await getDashboard()),
}));

import { getReports } from "@/server/queries";
import { HttpError } from "@/server/http";
import { isoDaysAgo, todayISO } from "@/lib/format";
import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (_user, req: Request) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || isoDaysAgo(29);
  const to = url.searchParams.get("to") || todayISO();
  if (from > to) throw new HttpError("Start date must come before the end date");
  return getReports(from, to);
});

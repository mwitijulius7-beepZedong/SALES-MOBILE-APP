import { v1 } from "@/server/v1";

export const dynamic = "force-dynamic";

export const GET = v1(async (user) => ({ user }));

import { db } from "@/db";
import { customers, products } from "@/db/schema";
import { asc } from "drizzle-orm";
import { withAuth } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  const [cats, sups, customerRows] = await Promise.all([
    db.select({ category: products.category }).from(products).groupBy(products.category).orderBy(asc(products.category)),
    db.select({ supplier: products.supplier }).from(products).groupBy(products.supplier).orderBy(asc(products.supplier)),
    db
      .select({ id: customers.id, name: customers.name, segment: customers.segment, area: customers.area })
      .from(customers)
      .orderBy(asc(customers.name)),
  ]);
  return {
    categories: cats.map((c) => c.category),
    suppliers: sups.map((s) => s.supplier).filter(Boolean),
    customers: customerRows,
    units: ["cs", "pc", "kg", "ltr", "pack"].map((u) => ({ value: u, label: u })),
    movementTypes: ["receipt", "sale", "return", "damage", "adjustment", "requisition"],
  };
});


import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  counters,
  customers,
  expenses,
  products,
  requisitions,
  saleItems,
  sales,
  stockMovements,
} from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { isoDaysAgo, todayISO } from "@/lib/format";
import { auditRow } from "@/server/admin";

const num = (value: unknown) => Number(value ?? 0) || 0;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ------------------------------------------------------------------ */
/* Sequences — race-safe document numbering (INV-###, REQ-###)         */
/* ------------------------------------------------------------------ */

let countersReady: Promise<void> | null = null;

/** The counters table may predate this code on existing databases. */
function ensureCountersTable() {
  countersReady ??= db
    .execute(
      sql`create table if not exists counters (key text primary key, value integer not null default 0, updated_at timestamptz not null default now())`,
    )
    .then(() => undefined)
    .catch((error) => {
      countersReady = null;
      throw error;
    });
  return countersReady;
}

async function nextInvoiceNumber(tx: Tx) {
  await ensureCountersTable();
  const result = await tx.execute<{ value: number }>(sql`
    insert into counters (key, value)
    select 'invoice', coalesce(max(nullif(split_part(invoice_no, '-', 2), '')::int), 24099) + 1 from sales
    on conflict (key) do update set value = counters.value + 1, updated_at = now()
    returning value`);
  return `INV-${num(result.rows[0]?.value)}`;
}

async function nextRequisitionNumber(tx: Tx) {
  await ensureCountersTable();
  const result = await tx.execute<{ value: number }>(sql`
    insert into counters (key, value)
    select 'requisition', coalesce(max(nullif(split_part(req_no, 'REQ-', 2), '')::int), 1299) + 1 from requisitions
    on conflict (key) do update set value = counters.value + 1, updated_at = now()
    returning value`);
  return `REQ-${num(result.rows[0]?.value)}`;
}

async function totals(fromISO: string, toISO: string, userId?: number) {
  const where = and(
    gte(sales.saleDate, fromISO),
    lte(sales.saleDate, toISO),
    inArray(sales.status, ["completed", "pending"]),
    userId ? eq(sales.soldById, userId) : undefined,
  );
  const [row] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${sales.totalCents}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
      pending: sql<string>`coalesce(sum(${sales.totalCents}) filter (where ${eq(sales.status, 'pending')}), 0)::text`,
      cost: sql<string>`coalesce(sum(${sales.costCents}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
      orders: sql<string>`count(*)::text`,
      completed: sql<string>`count(*) filter (where ${eq(sales.status, 'completed')})::text`,
      units: sql<string>`coalesce(sum(${sales.totalQty}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
    })
    .from(sales)
    .where(where);

  const [expenseRow] = await db
    .select({
      amount: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::text`,
      count: sql<string>`count(*)::text`,
    })
    .from(expenses)
    .where(and(gte(expenses.expenseDate, fromISO), lte(expenses.expenseDate, toISO)));

  const revenue = num(row?.revenue);
  const cost = num(row?.cost);
  return {
    revenue,
    pending: num(row?.pending),
    cost,
    grossProfit: revenue - cost,
    marginPct: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    orders: num(row?.orders),
    completedOrders: num(row?.completed),
    units: num(row?.units),
    avgBasket: num(row?.completed) ? Math.round(revenue / num(row!.completed)) : 0,
    expenses: num(expenseRow?.amount),
    expenseCount: num(expenseRow?.count),
    netCash: revenue - num(expenseRow?.amount),
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export async function getDashboard() {
  const today = todayISO();
  const yesterday = isoDaysAgo(1);
  const rangeStart = isoDaysAgo(13);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthAnchor = new Date(`${monthStart}T00:00:00`);
  prevMonthAnchor.setMonth(prevMonthAnchor.getMonth() - 1);
  const prevMonthStart = prevMonthAnchor.toISOString().slice(0, 10);
  const monthBefore = new Date(`${monthStart}T00:00:00`);
  monthBefore.setDate(monthBefore.getDate() - 1);
  const prevMonthEnd = monthBefore.toISOString().slice(0, 10);

  const [todayStats, yesterdayStats, monthStats, prevMonthStats] = await Promise.all([
    totals(today, today),
    totals(yesterday, yesterday),
    totals(monthStart, today),
    totals(prevMonthStart, prevMonthEnd),
  ]);

  const [seriesRows, paymentRows, categoryRows, stockRows, recentSales, lowStock, pendingReqs, movementRows] =
    await Promise.all([
      db
        .select({
          date: sales.saleDate,
          revenue: sql<string>`coalesce(sum(${sales.totalCents}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
          orders: sql<string>`count(*)::text`,
        })
        .from(sales)
        .where(and(gte(sales.saleDate, rangeStart), lte(sales.saleDate, today)))
        .groupBy(sales.saleDate)
        .orderBy(asc(sales.saleDate)),
      db
        .select({
          label: sales.paymentMethod,
          value: sql<string>`coalesce(sum(${sales.totalCents}), 0)::text`,
        })
        .from(sales)
        .where(and(gte(sales.saleDate, isoDaysAgo(29)), inArray(sales.status, ["completed", "pending"])))
        .groupBy(sales.paymentMethod),
      db
        .select({
          label: products.category,
          value: sql<string>`coalesce(sum(${saleItems.lineTotalCents}), 0)::text`,
          units: sql<string>`coalesce(sum(${saleItems.qty}), 0)::text`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .innerJoin(products, eq(products.id, saleItems.productId))
        .where(and(gte(sales.saleDate, isoDaysAgo(13)), lte(sales.saleDate, today)))
        .groupBy(products.category)
        .orderBy(desc(sql`sum(${saleItems.lineTotalCents})`)),
      db
        .select({
          skus: sql<string>`count(*)::text`,
          units: sql<string>`coalesce(sum(${products.stock}), 0)::text`,
          costValue: sql<string>`coalesce(sum(${products.stock} * ${products.costCents}), 0)::text`,
          retailValue: sql<string>`coalesce(sum(${products.stock} * ${products.priceCents}), 0)::text`,
          low: sql<string>`count(*) filter (where ${products.stock} > 0 and ${products.stock} <= ${products.reorderLevel})::text`,
          out: sql<string>`count(*) filter (where ${products.stock} <= 0)::text`,
        })
        .from(products),
      db.select().from(sales).orderBy(desc(sales.createdAt)).limit(6),
      db
        .select()
        .from(products)
        .where(or(lte(products.stock, sql`${products.reorderLevel}`), lt(products.stock, 1)))
        .orderBy(asc(products.stock))
        .limit(6),
      db
        .select({ count: sql<string>`count(*) filter (where ${inArray(requisitions.status, ['pending'])})::text` })
        .from(requisitions),
      db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(8),
    ]);

  const byDate = new Map(seriesRows.map((r) => [r.date, r]));
  const series: { date: string; revenue: number; orders: number; expenses: number }[] = Array.from({ length: 14 }, (_: unknown, i: number) => {
    const date = isoDaysAgo(13 - i);
    const row = byDate.get(date);
    return {
      date,
      revenue: num(row?.revenue),
      orders: num(row?.orders),
      expenses: 0,
    };
  });

  const expenseSeries = await db
    .select({
      date: expenses.expenseDate,
      amount: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::text`,
    })
    .from(expenses)
    .where(and(gte(expenses.expenseDate, rangeStart), lte(expenses.expenseDate, today)))
    .groupBy(expenses.expenseDate)
    .orderBy(asc(expenses.expenseDate));
  const expenseMap = new Map(expenseSeries.map((e) => [e.date, num(e.amount)]));
  for (const point of series) point.expenses = expenseMap.get(point.date) ?? 0;

  const stock = stockRows[0] ?? {
    skus: "0",
    units: "0",
    costValue: "0",
    retailValue: "0",
    low: "0",
    out: "0",
  };

  return {
    today: { ...todayStats, deltaRevenue: todayStats.revenue - yesterdayStats.revenue },
    month: { ...monthStats, prevRevenue: prevMonthStats.revenue },
    stock: {
      skus: num(stock.skus),
      units: num(stock.units),
      costValue: num(stock.costValue),
      retailValue: num(stock.retailValue),
      low: num(stock.low),
      out: num(stock.out),
    },
    series,
    payments: paymentRows.map((p) => ({ label: p.label, value: num(p.value) })),
    categories: categoryRows.map((c) => ({ label: c.label, value: num(c.value), units: num(c.units) })),
    recentSales,
    lowStock,
    pendingRequisitions: num(pendingReqs[0]?.count),
    movements: movementRows,
  };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export async function listProducts(params: {
  q?: string;
  category?: string;
  status?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params.q) {
    const needle = `%${params.q}%`;
    conditions.push(or(ilike(products.name, needle), ilike(products.sku, needle), ilike(products.supplier, needle)));
  }
  if (params.category && params.category !== "all") conditions.push(eq(products.category, params.category));
  if (params.status === "low") conditions.push(and(gt(products.stock, 0), lte(products.stock, products.reorderLevel)));
  if (params.status === "out") conditions.push(lte(products.stock, 0));
  if (params.status === "healthy") conditions.push(gt(products.stock, products.reorderLevel));

  const order =
    params.sort === "price"
      ? desc(products.priceCents)
      : params.sort === "margin"
        ? desc(sql`${products.priceCents} - ${products.costCents}`)
        : params.sort === "stock"
          ? asc(products.stock)
          : desc(products.updatedAt);

  let query = db.select().from(products).where(conditions.length ? and(...conditions) : undefined).orderBy(order);
  if (params.limit !== undefined) {
    query = query.limit(Math.max(params.limit, 0) + 1).offset(Math.max(params.offset ?? 0, 0)) as typeof query;
  }
  const fetched = await query;
  const hasMore = params.limit !== undefined && fetched.length > params.limit;
  if (hasMore) fetched.pop();
  const rows = fetched;

  const soldRows = rows.length
    ? await db
        .select({
          productId: saleItems.productId,
          qty: sql<string>`coalesce(sum(${saleItems.qty}), 0)::text`,
          revenue: sql<string>`coalesce(sum(${saleItems.lineTotalCents}), 0)::text`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(gte(sales.saleDate, isoDaysAgo(29)), inArray(saleItems.productId, rows.map((r) => r.id))))
        .groupBy(saleItems.productId)
    : [];
  const soldMap = new Map(soldRows.map((s) => [s.productId, s]));

  return {
    hasMore,
    rows: rows.map((p) => ({
      ...p,
      soldQty30d: num(soldMap.get(p.id)?.qty),
      soldRevenue30d: num(soldMap.get(p.id)?.revenue),
      marginCents: p.priceCents - p.costCents,
      marginPct: p.priceCents ? ((p.priceCents - p.costCents) / p.priceCents) * 100 : 0,
      stockValueCents: p.stock * p.costCents,
      status: p.stock <= 0 ? ("out" as const) : p.stock <= p.reorderLevel ? ("low" as const) : ("healthy" as const),
    })),
  };
}

export async function getProduct(id: number) {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) throw new HttpError("Product not found", 404);
  const movements = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(12);
  return { ...row, movements };
}

export async function upsertProduct(id: number | null, data: typeof products.$inferInsert) {
  if (id) {
    const [row] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!row) throw new HttpError("Product not found", 404);
    return row;
  }
  const [row] = await db.insert(products).values(data).returning();
  return row;
}

async function generateUniqueSku() {
  for (let guard = 0; guard < 20; guard++) {
    const sku = `VF-${Math.floor(1000 + Math.random() * 8999)}`;
    const clash = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1);
    if (!clash.length) return sku;
  }
  return `VF-${Date.now().toString().slice(-6)}`;
}

/** Creates a product, assigning/validating its SKU and logging opening stock. */
export async function createProduct(
  values: Omit<typeof products.$inferInsert, "sku">,
  requestedSku: string,
  actor: { id: number; name: string },
) {
  const sku = requestedSku.trim().toUpperCase();
  let finalSku = sku;
  if (finalSku) {
    const clash = await db.select({ id: products.id }).from(products).where(eq(products.sku, finalSku)).limit(1);
    if (clash.length) throw new HttpError(`SKU ${finalSku} already exists`);
  } else {
    finalSku = await generateUniqueSku();
  }
  const row = await upsertProduct(null, { ...values, sku: finalSku });
  if ((values.stock ?? 0) > 0) {
    await adjustStock({
      productId: row.id,
      qtyChange: 0,
      reason: "adjustment",
      reference: "OPENING",
      note: `Catalogue created by ${actor.name} with ${values.stock} ${row.unit} on hand`,
      actor,
    });
  }
  return row;
}

export async function adjustStock(input: {
  productId: number;
  qtyChange: number;
  reason: string;
  reference?: string;
  note?: string;
  actor: { id: number; name: string };
}) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1)
      .for("update");
    if (!product) throw new HttpError("Product not found", 404);
    const next = product.stock + input.qtyChange;
    if (next < 0) throw new HttpError(`Only ${product.stock} ${product.unit} on hand — cannot reduce further.`);

    await tx.update(products).set({ stock: next, updatedAt: new Date() }).where(eq(products.id, product.id));
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        productId: product.id,
        productName: product.name,
        type: input.reason,
        qtyChange: input.qtyChange,
        stockAfter: next,
        reference: input.reference ?? "",
        note: input.note ?? "",
        createdById: input.actor.id,
        createdByName: input.actor.name,
      })
      .returning();

    return { product: { ...product, stock: next, updatedAt: new Date() }, movement, stock: next };
  });
}

export async function deleteProduct(id: number) {
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select({ id: saleItems.id })
      .from(saleItems)
      .where(eq(saleItems.productId, id))
      .limit(1);
    if (sale) {
      const [p] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
      await tx.update(products).set({ active: false, updatedAt: new Date() }).where(eq(products.id, id));
      return { archived: true, name: p?.name ?? "Product" };
    }
    await tx.delete(products).where(eq(products.id, id));
    await tx.delete(stockMovements).where(eq(stockMovements.productId, id));
    return { archived: false };
  });
}

/* ------------------------------------------------------------------ */
/* Sales                                                               */
/* ------------------------------------------------------------------ */

export async function listSales(params: {
  q?: string;
  status?: string;
  range?: string;
  method?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params.q) {
    const needle = `%${params.q}%`;
    conditions.push(or(ilike(sales.invoiceNo, needle), ilike(sales.customerName, needle), ilike(sales.soldByName, needle)));
  }
  if (params.status && params.status !== "all") conditions.push(eq(sales.status, params.status));
  if (params.method && params.method !== "all") conditions.push(eq(sales.paymentMethod, params.method));
  if (params.range && params.range !== "all") {
    const days = Number(params.range.replace("d", "")) || 30;
    conditions.push(gte(sales.saleDate, isoDaysAgo(days - 1)));
  }

  const limit = Math.min(Math.max(params.limit ?? 180, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const fetched = await db
    .select()
    .from(sales)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(sales.saleDate), desc(sales.createdAt))
    .limit(limit + 1)
    .offset(offset);
  const hasMore = fetched.length > limit;
  if (hasMore) fetched.pop();
  const rows = fetched;

  const items = rows.length
    ? await db
        .select({
          saleId: saleItems.saleId,
          productId: saleItems.productId,
          sku: saleItems.sku,
          productName: saleItems.productName,
          unit: saleItems.unit,
          qty: saleItems.qty,
          unitPriceCents: saleItems.unitPriceCents,
          lineTotalCents: saleItems.lineTotalCents,
        })
        .from(saleItems)
        .where(inArray(saleItems.saleId, rows.map((r) => r.id)))
    : [];

  return {
    hasMore,
    rows: rows.map((s) => ({
      ...s,
      items: items.filter((i) => i.saleId === s.id),
    })),
  };
}

export async function getSale(id: number) {
  const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!sale) throw new HttpError("Sale not found", 404);
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(asc(saleItems.id));
  return { ...sale, items };
}

export async function createSale(input: {
  lines: { productId: number; qty: number }[];
  customerId: number | null;
  customerName: string;
  channel: string;
  paymentMethod: string;
  discountCents: number;
  applyTax: boolean;
  saleDate: string;
  status: string;
  note: string;
  actor: { id: number; name: string };
}) {
  if (!input.lines.length) throw new HttpError("Add at least one product to the sale");

  const saleId = await db.transaction(async (tx) => {
    const ids = input.lines.map((l) => l.productId);
    const productRows = await tx.select().from(products).where(inArray(products.id, ids)).for("update");
    const map = new Map(productRows.map((p) => [p.id, p]));

    let subtotal = 0;
    let cost = 0;
    let totalQty = 0;
    const resolved = input.lines.map((line) => {
      const product = map.get(line.productId);
      if (!product) throw new HttpError(`Product ${line.productId} no longer exists`);
      if (line.qty > product.stock) {
        throw new HttpError(`Only ${product.stock} ${product.unit} of ${product.name} left in stock`);
      }
      subtotal += line.qty * product.priceCents;
      cost += line.qty * product.costCents;
      totalQty += line.qty;
      return { product, qty: line.qty };
    });

    const discount = Math.min(Math.max(input.discountCents, 0), subtotal);
    const tax = input.applyTax ? Math.round((subtotal - discount) * 0.075) : 0;
    const total = subtotal - discount + tax;

    const invoiceNo = await nextInvoiceNumber(tx);

    const [sale] = await tx
      .insert(sales)
      .values({
        invoiceNo,
        customerId: input.customerId,
        customerName: input.customerName,
        channel: input.channel,
        status: input.status,
        paymentMethod: input.paymentMethod,
        subtotalCents: subtotal,
        discountCents: discount,
        taxCents: tax,
        totalCents: total,
        costCents: cost,
        totalQty,
        itemCount: resolved.length,
        note: input.note,
        saleDate: input.saleDate,
        soldById: input.actor.id,
        soldByName: input.actor.name,
      })
      .returning({ id: sales.id });

    await tx.insert(saleItems).values(
      resolved.map(({ product, qty }) => ({
        saleId: sale.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        qty,
        unitPriceCents: product.priceCents,
        lineTotalCents: qty * product.priceCents,
      })),
    );

    if (input.status === "completed") {
      for (const { product, qty } of resolved) {
        const next = product.stock - qty;
        await tx.update(products).set({ stock: Math.max(0, next), updatedAt: new Date() }).where(eq(products.id, product.id));
        await tx.insert(stockMovements).values({
          productId: product.id,
          productName: product.name,
          type: "sale",
          qtyChange: -qty,
          stockAfter: Math.max(0, next),
          reference: invoiceNo,
          note: `${input.customerName} · ${input.channel}`,
          createdById: input.actor.id,
          createdByName: input.actor.name,
        });
      }
      if (input.customerId && input.paymentMethod === "credit") {
        await tx
          .update(customers)
          .set({ balanceCents: sql`${customers.balanceCents} + ${total}` })
          .where(eq(customers.id, input.customerId));
      }
    }

    return sale.id;
  });

  return getSale(saleId);
}

export async function setSaleStatus(id: number, status: string, actor: { id: number; name: string }) {
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).limit(1).for("update");
    if (!sale) throw new HttpError("Sale not found", 404);

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    const productIds = items.map((i) => i.productId).filter((v): v is number => typeof v === "number");
    const productRows = productIds.length
      ? await tx.select().from(products).where(inArray(products.id, productIds)).for("update")
      : [];
    const pmap = new Map(productRows.map((p) => [p.id, p]));

    // Stock bookkeeping: completed consumes stock, pending/refunded releases it.
    const wasStockOut = sale.status === "completed";
    const willStockOut = status === "completed";
    if (wasStockOut && !willStockOut) {
      for (const item of items) {
        if (!item.productId) continue;
        const p = pmap.get(item.productId);
        if (!p) continue;
        const next = p.stock + item.qty;
        await tx.update(products).set({ stock: next, updatedAt: new Date() }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({
          productId: p.id,
          productName: p.name,
          type: status === "refunded" ? "return" : "adjustment",
          qtyChange: item.qty,
          stockAfter: next,
          reference: sale.invoiceNo,
          note: status === "refunded" ? `Refunded — ${sale.customerName}` : `Reverted to ${status}`,
          createdById: actor.id,
          createdByName: actor.name,
        });
      }
      if (sale.customerId && sale.paymentMethod === "credit") {
        await tx
          .update(customers)
          .set({ balanceCents: sql`greatest(${customers.balanceCents} - ${sale.totalCents}, 0)` })
          .where(eq(customers.id, sale.customerId));
      }
    }
    if (!wasStockOut && willStockOut) {
      for (const item of items) {
        if (!item.productId) continue;
        const p = pmap.get(item.productId);
        if (!p) continue;
        if (p.stock < item.qty) throw new HttpError(`Not enough stock for ${p.name} (have ${p.stock}, need ${item.qty})`);
        const next = p.stock - item.qty;
        await tx.update(products).set({ stock: next, updatedAt: new Date() }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({
          productId: p.id,
          productName: p.name,
          type: "sale",
          qtyChange: -item.qty,
          stockAfter: next,
          reference: sale.invoiceNo,
          note: `${sale.customerName} · ${sale.channel}`,
          createdById: actor.id,
          createdByName: actor.name,
        });
      }
      if (sale.customerId && sale.paymentMethod === "credit") {
        await tx
          .update(customers)
          .set({ balanceCents: sql`${customers.balanceCents} + ${sale.totalCents}` })
          .where(eq(customers.id, sale.customerId));
      }
    }

    await tx.update(sales).set({ status }).where(eq(sales.id, id));
    const [updated] = await tx.select().from(sales).where(eq(sales.id, id)).limit(1);
    const finalItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(asc(saleItems.id));
    return { ...updated, items: finalItems };
  });
}

export async function deleteSale(id: number, actor: { id: number; name: string }) {
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).limit(1).for("update");
    if (!sale) throw new HttpError("Sale not found", 404);
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    const productIds = items.map((i) => i.productId).filter((v): v is number => typeof v === "number");
    const productRows = productIds.length
      ? await tx.select().from(products).where(inArray(products.id, productIds)).for("update")
      : [];
    const pmap = new Map(productRows.map((p) => [p.id, p]));

    if (sale.status === "completed") {
      for (const item of items) {
        if (!item.productId) continue;
        const p = pmap.get(item.productId);
        if (!p) continue;
        const next = p.stock + item.qty;
        await tx
          .update(products)
          .set({ stock: next, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({
          productId: p.id,
          productName: p.name,
          type: "return",
          qtyChange: item.qty,
          stockAfter: next,
          reference: sale.invoiceNo,
          note: `Invoice voided by ${actor.name}`,
          createdById: actor.id,
          createdByName: actor.name,
        });
      }
      if (sale.customerId && sale.paymentMethod === "credit") {
        await tx
          .update(customers)
          .set({ balanceCents: sql`greatest(${customers.balanceCents} - ${sale.totalCents}, 0)` })
          .where(eq(customers.id, sale.customerId));
      }
    }
    await tx.delete(saleItems).where(eq(saleItems.saleId, id));
    await tx.delete(sales).where(eq(sales.id, id));
    return { deleted: true, invoiceNo: sale.invoiceNo };
  });
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export async function listExpenses(params: {
  q?: string;
  category?: string;
  range?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params.q) {
    const needle = `%${params.q}%`;
    conditions.push(or(ilike(expenses.title, needle), ilike(expenses.vendor, needle), ilike(expenses.note, needle)));
  }
  if (params.category && params.category !== "all") conditions.push(eq(expenses.category, params.category));
  if (params.status && params.status !== "all") conditions.push(eq(expenses.status, params.status));
  if (params.range && params.range !== "all") {
    const days = Number(params.range.replace("d", "")) || 30;
    conditions.push(gte(expenses.expenseDate, isoDaysAgo(days - 1)));
  }
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const fetched = await db
    .select()
    .from(expenses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(limit + 1)
    .offset(offset);
  const hasMore = fetched.length > limit;
  if (hasMore) fetched.pop();
  const rows = fetched;

  const [agg] = await db
    .select({
      amount: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::text`,
      count: sql<string>`count(*)::text`,
      avg: sql<string>`coalesce(avg(${expenses.amountCents}), 0)::text`,
    })
    .from(expenses)
    .where(conditions.length ? and(...conditions) : undefined);

  const byCategory = await db
    .select({
      label: expenses.category,
      value: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::text`,
      count: sql<string>`count(*)::text`,
    })
    .from(expenses)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.amountCents})`));

  const statusRows = await db
    .select({ status: expenses.status, count: sql<string>`count(*)::text` })
    .from(expenses)
    .groupBy(expenses.status);

  return {
    rows,
    hasMore,
    summary: {
      amount: num(agg?.amount),
      count: num(agg?.count),
      avg: num(agg?.avg),
      pending: num(statusRows.find((s) => s.status === "pending")?.count),
      approved: num(statusRows.find((s) => s.status === "approved")?.count),
      rejected: num(statusRows.find((s) => s.status === "rejected")?.count),
    },
    byCategory: byCategory.map((c) => ({ label: c.label, value: num(c.value), count: num(c.count) })),
  };
}

export async function upsertExpense(id: number | null, data: typeof expenses.$inferInsert) {
  if (id) {
    const [row] = await db.update(expenses).set(data).where(eq(expenses.id, id)).returning();
    if (!row) throw new HttpError("Expense not found", 404);
    return row;
  }
  const [row] = await db.insert(expenses).values(data).returning();
  return row;
}

export async function deleteExpense(id: number, actor?: { id: number; name: string }) {
  const [row] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
  if (actor) {
    await db
      .insert(auditLog)
      .values(
        auditRow({
          actor,
          action: "expense.delete",
          entity: "expense",
          entityId: id,
          detail: row ? `${row.title} · ${row.amountCents}` : `Expense #${id}`,
        }),
      );
  }
  return { deleted: true };
}

/** Reps' expenses go to pending when approvals are on; approvers stay auto-approved. */
export function initialExpenseStatus(role: string, approvalsRequired: boolean, explicit?: string) {
  if (explicit) return explicit;
  const approver = role === "owner" || role === "manager";
  return approver || !approvalsRequired ? "approved" : "pending";
}

export async function decideExpense(
  id: number,
  status: string,
  note: string,
  actor: { id: number; name: string },
) {
  return db.transaction(async (tx) => {
    const [expense] = await tx.select().from(expenses).where(eq(expenses.id, id)).limit(1).for("update");
    if (!expense) throw new HttpError("Expense not found", 404);
    const [row] = await tx
      .update(expenses)
      .set({
        status,
        decisionNote: note,
        decidedBy: actor.name,
        decidedAt: new Date(),
      })
      .where(eq(expenses.id, id))
      .returning();
    await tx
      .insert(auditLog)
      .values(
        auditRow({
          actor,
          action: `expense.${status}`,
          entity: "expense",
          entityId: id,
          detail: `${expense.title} · ${expense.amountCents}${note ? ` — ${note}` : ""}`,
        }),
      );
    return row;
  });
}

/* ------------------------------------------------------------------ */
/* Requisitions                                                        */
/* ------------------------------------------------------------------ */

export async function listRequisitions(params: {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params.q) {
    const needle = `%${params.q}%`;
    conditions.push(or(ilike(requisitions.reqNo, needle), ilike(requisitions.productName, needle), ilike(requisitions.requester, needle)));
  }
  if (params.status && params.status !== "all") conditions.push(eq(requisitions.status, params.status));

  let query = db
    .select()
    .from(requisitions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      desc(sql`case when ${requisitions.priority} = 'urgent' then 3 when ${requisitions.priority} = 'high' then 2 when ${requisitions.priority} = 'normal' then 1 else 0 end`),
      desc(requisitions.createdAt),
    );
  if (params.limit !== undefined) {
    query = query.limit(Math.max(params.limit, 0) + 1).offset(Math.max(params.offset ?? 0, 0)) as typeof query;
  }
  const fetched = await query;
  const hasMore = params.limit !== undefined && fetched.length > params.limit;
  if (hasMore) fetched.pop();
  const rows = fetched;

  const counts = await db
    .select({
      status: requisitions.status,
      count: sql<string>`count(*)::text`,
    })
    .from(requisitions)
    .groupBy(requisitions.status);

  return {
    rows,
    hasMore,
    counts: {
      all: counts.reduce((sum, c) => sum + num(c.count), 0),
      pending: num(counts.find((c) => c.status === "pending")?.count),
      approved: num(counts.find((c) => c.status === "approved")?.count),
      rejected: num(counts.find((c) => c.status === "rejected")?.count),
      received: num(counts.find((c) => c.status === "received")?.count),
    },
  };
}

export async function getRequisition(id: number) {
  const [row] = await db.select().from(requisitions).where(eq(requisitions.id, id)).limit(1);
  if (!row) throw new HttpError("Requisition not found", 404);
  return row;
}

export async function createRequisition(data: Omit<typeof requisitions.$inferInsert, "reqNo">) {
  return db.transaction(async (tx) => {
    const reqNo = await nextRequisitionNumber(tx);
    const [row] = await tx.insert(requisitions).values({ ...data, reqNo }).returning();
    return row;
  });
}

export async function decideRequisition(
  id: number,
  status: string,
  note: string,
  actor: { id: number; name: string },
  approvedQty?: number,
) {
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(requisitions).where(eq(requisitions.id, id)).limit(1).for("update");
    if (!req) throw new HttpError("Requisition not found", 404);

    if (approvedQty !== undefined && approvedQty > req.requestedQty) {
      throw new HttpError(`Approved quantity can't exceed the requested ${req.requestedQty}`);
    }
    if (approvedQty !== undefined && status === "approved" && approvedQty < 1) {
      throw new HttpError("Approve at least 1 unit, or reject the requisition instead");
    }

    const patch: Partial<typeof requisitions.$inferInsert> = {
      status,
      decisionNote: note,
      decidedBy: actor.name,
      decidedAt: new Date(),
    };
    if (status === "approved") patch.approvedQty = approvedQty ?? req.requestedQty;
    if (status === "rejected") patch.approvedQty = 0;

    if (status === "received") {
      patch.approvedQty = approvedQty ?? (req.approvedQty || req.requestedQty);
      if (req.productId && req.status !== "received") {
        const [p] = await tx.select().from(products).where(eq(products.id, req.productId)).limit(1).for("update");
        if (p) {
          const qty = patch.approvedQty || req.requestedQty;
          const next = p.stock + qty;
          await tx.update(products).set({ stock: next, updatedAt: new Date() }).where(eq(products.id, p.id));
          await tx.insert(stockMovements).values({
            productId: p.id,
            productName: p.name,
            type: "requisition",
            qtyChange: qty,
            stockAfter: next,
            reference: req.reqNo,
            note: `Received for ${req.department}`,
            createdById: actor.id,
            createdByName: actor.name,
          });
        }
      }
    }

    const [row] = await tx.update(requisitions).set(patch).where(eq(requisitions.id, id)).returning();
    await tx
      .insert(auditLog)
      .values(
        auditRow({
          actor,
          action: `requisition.${status}`,
          entity: "requisition",
          entityId: id,
          detail: `${req.reqNo}${patch.approvedQty !== undefined ? ` · ${patch.approvedQty}/${req.requestedQty}` : ""}${note ? ` — ${note}` : ""}`,
        }),
      );
    return row;
  });
}

export async function deleteRequisition(id: number, actor?: { id: number; name: string }) {
  const [row] = await db.delete(requisitions).where(eq(requisitions.id, id)).returning();
  if (actor) {
    await db
      .insert(auditLog)
      .values(
        auditRow({
          actor,
          action: "requisition.delete",
          entity: "requisition",
          entityId: id,
          detail: row?.reqNo ?? `Requisition #${id}`,
        }),
      );
  }
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export async function getReports(fromISO: string, toISO: string) {
  const [rangeTotals, salesByProduct, movementRows, stockRows, dailySales, dailyExpenses, customersOutstanding] =
    await Promise.all([
      totals(fromISO, toISO),
      db
        .select({
          productId: saleItems.productId,
          productName: saleItems.productName,
          sku: saleItems.sku,
          qty: sql<string>`coalesce(sum(${saleItems.qty}), 0)::text`,
          revenue: sql<string>`coalesce(sum(${saleItems.lineTotalCents}), 0)::text`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(gte(sales.saleDate, fromISO), lte(sales.saleDate, toISO), inArray(sales.status, ["completed", "pending"])))
        .groupBy(saleItems.productName, saleItems.productId, saleItems.sku)
        .orderBy(desc(sql`sum(${saleItems.lineTotalCents})`))
        .limit(12),
      db
        .select()
        .from(stockMovements)
        .where(and(gte(stockMovements.createdAt, new Date(`${fromISO}T00:00:00`)), isNotNull(stockMovements.productId)))
        .orderBy(desc(stockMovements.createdAt))
        .limit(60),
      db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          category: products.category,
          unit: products.unit,
          stock: products.stock,
          reorderLevel: products.reorderLevel,
          costCents: products.costCents,
          priceCents: products.priceCents,
          bin: products.bin,
          supplier: products.supplier,
        })
        .from(products)
        .orderBy(asc(products.category), asc(products.name)),
      db
        .select({
          date: sales.saleDate,
          revenue: sql<string>`coalesce(sum(${sales.totalCents}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
          cost: sql<string>`coalesce(sum(${sales.costCents}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
          orders: sql<string>`count(*)::text`,
        })
        .from(sales)
        .where(and(gte(sales.saleDate, fromISO), lte(sales.saleDate, toISO)))
        .groupBy(sales.saleDate)
        .orderBy(asc(sales.saleDate)),
      db
        .select({
          date: expenses.expenseDate,
          amount: sql<string>`coalesce(sum(${expenses.amountCents}), 0)::text`,
        })
        .from(expenses)
        .where(and(gte(expenses.expenseDate, fromISO), lte(expenses.expenseDate, toISO)))
        .groupBy(expenses.expenseDate)
        .orderBy(asc(expenses.expenseDate)),
      db
        .select()
        .from(customers)
        .where(gt(customers.balanceCents, 0))
        .orderBy(desc(customers.balanceCents))
        .limit(6),
    ]);

  const expenseByDate = new Map(dailyExpenses.map((e) => [e.date, num(e.amount)]));
  const saleByDate = new Map(dailySales.map((s) => [s.date, s]));
  const dates = new Set([...dailySales.map((s) => s.date), ...dailyExpenses.map((e) => e.date)]);
  const timeline = [...dates].sort().map((date) => ({
    date,
    revenue: num(saleByDate.get(date)?.revenue),
    cost: num(saleByDate.get(date)?.cost),
    expenses: expenseByDate.get(date) ?? 0,
    orders: num(saleByDate.get(date)?.orders),
  }));

  const stockTable = stockRows.map((p) => ({
    ...p,
    costValue: p.stock * p.costCents,
    retailValue: p.stock * p.priceCents,
    potential: p.stock * (p.priceCents - p.costCents),
    cover: p.stock,
    status: p.stock <= 0 ? ("out" as const) : p.stock <= p.reorderLevel ? ("low" as const) : ("healthy" as const),
  }));

  return {
    range: { from: fromISO, to: toISO },
    totals: rangeTotals,
    timeline,
    salesByProduct: salesByProduct.map((s) => ({
      productId: s.productId,
      name: s.productName,
      sku: s.sku,
      qty: num(s.qty),
      revenue: num(s.revenue),
    })),
    stock: stockTable,
    movements: movementRows,
    receivables: customersOutstanding,
  };
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export async function listCustomers(params: { q?: string; limit?: number; offset?: number } = {}) {
  let query = db
    .select()
    .from(customers)
    .where(
      params.q
        ? or(ilike(customers.name, `%${params.q}%`), ilike(customers.area, `%${params.q}%`), ilike(customers.contactName, `%${params.q}%`))
        : undefined,
    )
    .orderBy(asc(customers.name));
  if (params.limit !== undefined) {
    query = query.limit(Math.max(params.limit, 0) + 1).offset(Math.max(params.offset ?? 0, 0)) as typeof query;
  }
  const fetched = await query;
  const hasMore = params.limit !== undefined && fetched.length > params.limit;
  if (hasMore) fetched.pop();
  const rows = fetched;

  const agg = await db
    .select({
      customerId: sales.customerId,
      revenue: sql<string>`coalesce(sum(${sales.totalCents}) filter (where ${eq(sales.status, 'completed')}), 0)::text`,
      orders: sql<string>`count(*)::text`,
      lastOrder: sql<string>`max(${sales.saleDate})::text`,
    })
    .from(sales)
    .where(isNotNull(sales.customerId))
    .groupBy(sales.customerId);

  return {
    hasMore,
    rows: rows.map((c) => {
      const row = agg.find((a) => a.customerId === c.id);
      return {
        ...c,
        lifetimeCents: num(row?.revenue),
        orders: num(row?.orders),
        lastOrder: row?.lastOrder ?? "",
        creditUsagePct: c.creditLimitCents ? (c.balanceCents / c.creditLimitCents) * 100 : 0,
      };
    }),
  };
}

export async function upsertCustomer(id: number | null, data: typeof customers.$inferInsert) {
  if (id) {
    const [row] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    if (!row) throw new HttpError("Customer not found", 404);
    return row;
  }
  const [row] = await db.insert(customers).values(data).returning();
  return row;
}

export async function deleteCustomer(id: number) {
  return db.transaction(async (tx) => {
    await tx.update(sales).set({ customerId: null }).where(eq(sales.customerId, id));
    await tx.delete(customers).where(eq(customers.id, id));
    return { deleted: true };
  });
}

/* ------------------------------------------------------------------ */
/* Reference lists                                                     */
/* ------------------------------------------------------------------ */

export async function getReferenceData() {
  const rows = await db.select({ category: products.category }).from(products).groupBy(products.category);
  const suppliers = await db.select({ supplier: products.supplier }).from(products).where(sql`${supplierActive()}`).groupBy(products.supplier);
  return {
    categories: rows.map((r) => r.category).sort(),
    suppliers: suppliers.map((s) => s.supplier).sort(),
  };
}

const supplierActive = () => sql`${products.active} = true`;

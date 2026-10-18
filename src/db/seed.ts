import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  expenses,
  products,
  requisitions,
  saleItems,
  sales,
  sessions,
  stockMovements,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";

/* Deterministic PRNG so the demo dataset is stable across reloads. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T,>(rand: Rand, arr: readonly T[]): T => arr[Math.floor(rand() * arr.length) % arr.length];
const int = (rand: Rand, min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (rand: Rand, p: number) => rand() < p;

function isoDate(offsetDays: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function stamp(dateISO: string, hour: number, minute: number) {
  return new Date(`${dateISO}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
}

type CatalogueRow = {
  name: string;
  category: string;
  unit: string;
  costCents: number;
  priceCents: number;
  opening: number;
  reorderLevel: number;
  bin: string;
  supplier: string;
};

const CATALOGUE: CatalogueRow[] = [
  { name: "Cola Fresh 50cl x24", category: "Beverages", unit: "cs", costCents: 4100, priceCents: 6000, opening: 180, reorderLevel: 60, bin: "A-01", supplier: "Northline Bottling" },
  { name: "Citrus Splash 1L x12", category: "Beverages", unit: "cs", costCents: 5200, priceCents: 7450, opening: 120, reorderLevel: 40, bin: "A-02", supplier: "Northline Bottling" },
  { name: "Spring Water 75cl x24", category: "Beverages", unit: "cs", costCents: 2400, priceCents: 3600, opening: 240, reorderLevel: 80, bin: "A-03", supplier: "Blue Ridge Water" },
  { name: "Energy Surge 25cl x12", category: "Beverages", unit: "cs", costCents: 6100, priceCents: 8900, opening: 64, reorderLevel: 36, bin: "A-04", supplier: "Volt Beverages" },
  { name: "Ginger Ale 33cl x24", category: "Beverages", unit: "cs", costCents: 4800, priceCents: 6900, opening: 96, reorderLevel: 40, bin: "A-05", supplier: "Northline Bottling" },
  { name: "Cold Brew Coffee 20cl x8", category: "Beverages", unit: "cs", costCents: 7300, priceCents: 10400, opening: 48, reorderLevel: 30, bin: "A-06", supplier: "Ember Roasters" },
  { name: "Fresh Milk 1L x6", category: "Dairy & Chilled", unit: "cs", costCents: 5600, priceCents: 7200, opening: 84, reorderLevel: 48, bin: "B-01", supplier: "Meadowlane Dairy" },
  { name: "Yoghurt Cups 125g x16", category: "Dairy & Chilled", unit: "cs", costCents: 4900, priceCents: 6800, opening: 56, reorderLevel: 30, bin: "B-02", supplier: "Meadowlane Dairy" },
  { name: "Salted Butter 250g x10", category: "Dairy & Chilled", unit: "cs", costCents: 8200, priceCents: 10900, opening: 34, reorderLevel: 24, bin: "B-03", supplier: "Meadowlane Dairy" },
  { name: "Cheddar Block 200g x12", category: "Dairy & Chilled", unit: "cs", costCents: 11400, priceCents: 14900, opening: 26, reorderLevel: 20, bin: "B-04", supplier: "Glenmore Foods" },
  { name: "Vanilla Ice Cream 2L x4", category: "Dairy & Chilled", unit: "cs", costCents: 13800, priceCents: 18400, opening: 18, reorderLevel: 16, bin: "B-05", supplier: "Polar Creamery" },
  { name: "Ultra Bright Soap 200g x12", category: "Personal Care", unit: "cs", costCents: 3400, priceCents: 5100, opening: 130, reorderLevel: 50, bin: "C-01", supplier: "Pureline FMCG" },
  { name: "Herbal Shampoo 400ml x12", category: "Personal Care", unit: "cs", costCents: 9800, priceCents: 13600, opening: 72, reorderLevel: 36, bin: "C-02", supplier: "Pureline FMCG" },
  { name: "Family Toothpaste 100ml x24", category: "Personal Care", unit: "cs", costCents: 10600, priceCents: 14400, opening: 60, reorderLevel: 30, bin: "C-03", supplier: "Brightsmile Co" },
  { name: "Roll-On Deodorant 50ml x24", category: "Personal Care", unit: "cs", costCents: 12400, priceCents: 16800, opening: 42, reorderLevel: 24, bin: "C-04", supplier: "Pureline FMCG" },
  { name: "Baby Wipes 72ct x8", category: "Personal Care", unit: "cs", costCents: 7600, priceCents: 10200, opening: 38, reorderLevel: 24, bin: "C-05", supplier: "Littleleaf Care" },
  { name: "Paper Towels 2ply x30", category: "Household", unit: "cs", costCents: 8900, priceCents: 11900, opening: 90, reorderLevel: 40, bin: "D-01", supplier: "Fiberworks Mills" },
  { name: "Laundry Powder 3kg x6", category: "Household", unit: "cs", costCents: 14200, priceCents: 18900, opening: 46, reorderLevel: 28, bin: "D-02", supplier: "Crystal Clean" },
  { name: "Dish Liquid 750ml x12", category: "Household", unit: "cs", costCents: 9400, priceCents: 12700, opening: 68, reorderLevel: 32, bin: "D-03", supplier: "Crystal Clean" },
  { name: "Bin Liners 40ct x10", category: "Household", unit: "cs", costCents: 5100, priceCents: 7300, opening: 54, reorderLevel: 24, bin: "D-04", supplier: "Polytrade Supply" },
  { name: "Multi-Surface Spray 500ml x12", category: "Household", unit: "cs", costCents: 10800, priceCents: 14500, opening: 30, reorderLevel: 24, bin: "D-05", supplier: "Crystal Clean" },
  { name: "Roasted Peanuts 250g x24", category: "Snacks", unit: "cs", costCents: 6400, priceCents: 8700, opening: 110, reorderLevel: 44, bin: "E-01", supplier: "Harvest & Vine" },
  { name: "Potato Crisps 150g x20", category: "Snacks", unit: "cs", costCents: 7800, priceCents: 10600, opening: 88, reorderLevel: 40, bin: "E-02", supplier: "Goldenfield Snacks" },
  { name: "Chocolate Biscuits 300g x18", category: "Snacks", unit: "cs", costCents: 8200, priceCents: 10900, opening: 76, reorderLevel: 36, bin: "E-03", supplier: "Ember Bakehouse" },
  { name: "Trail Mix 200g x16", category: "Snacks", unit: "cs", costCents: 9600, priceCents: 12900, opening: 34, reorderLevel: 24, bin: "E-04", supplier: "Harvest & Vine" },
  { name: "Tomato Paste 400g x24", category: "Pantry", unit: "cs", costCents: 11200, priceCents: 14800, opening: 92, reorderLevel: 40, bin: "F-01", supplier: "Harvest & Vine" },
  { name: "Long Grain Rice 5kg x4", category: "Pantry", unit: "cs", costCents: 16400, priceCents: 21200, opening: 60, reorderLevel: 30, bin: "F-02", supplier: "Delta Grains" },
  { name: "Sunflower Oil 5L x4", category: "Pantry", unit: "cs", costCents: 21800, priceCents: 27600, opening: 44, reorderLevel: 24, bin: "F-03", supplier: "Delta Grains" },
  { name: "Granulated Sugar 2kg x10", category: "Pantry", unit: "cs", costCents: 9800, priceCents: 12600, opening: 70, reorderLevel: 32, bin: "F-04", supplier: "Delta Grains" },
  { name: "Instant Noodles 70g x30", category: "Pantry", unit: "cs", costCents: 8600, priceCents: 11400, opening: 128, reorderLevel: 48, bin: "F-05", supplier: "Goldenfield Snacks" },
];

const CUSTOMER_SEED = [
  { name: "Junction Mini-Mart", contactName: "Priya Raman", segment: "Retail", area: "Eastside" },
  { name: "Bao & Basket Deli", contactName: "Marcus Oyelaran", segment: "Retail", area: "Old Town" },
  { name: "Northgate Superstore", contactName: "Lena Fischer", segment: "Key Account", area: "North Gate" },
  { name: "Sunset Trading Post", contactName: "Ayo Balogun", segment: "Wholesale", area: "Riverside" },
  { name: "Cedar Street Pharmacy", contactName: "Nadia Haddad", segment: "Retail", area: "Cedar Hill" },
  { name: "Harbour Point Café", contactName: "Tomás Ferreira", segment: "Retail", area: "Waterfront" },
  { name: "Elmwood Grocers", contactName: "Grace Adeyemi", segment: "Wholesale", area: "Elmwood" },
  { name: "QuickStop #14", contactName: "Ivan Petrov", segment: "Retail", area: "Airport Road" },
  { name: "Highland Wholesale Co", contactName: "Ruth Nkosi", segment: "Wholesale", area: "Highland Park" },
  { name: "Lakeside Family Mart", contactName: "Diego Marín", segment: "Retail", area: "Lakeside" },
  { name: "Union Yards Canteen", contactName: "Fatima Zahra", segment: "Key Account", area: "Union Yards" },
  { name: "Hale Avenue Market", contactName: "Chris Okafor", segment: "Retail", area: "Hale Ave" },
];

const EXPENSE_TEMPLATES = [
  { title: "Van fuel — east loop", category: "Logistics", min: 6000, max: 14000 },
  { title: "Route maintenance", category: "Logistics", min: 8000, max: 22000 },
  { title: "Warehouse electricity", category: "Utilities", min: 15000, max: 34000 },
  { title: "Cold-room servicing", category: "Maintenance", min: 22000, max: 48000 },
  { title: "Field team lunch allowance", category: "Team", min: 6000, max: 16000 },
  { title: "Sales incentive payout", category: "Team", min: 40000, max: 90000 },
  { title: "Shrink-wrap & pallets", category: "Packaging", min: 7000, max: 18000 },
  { title: "Printed invoices & POS rolls", category: "Office", min: 3000, max: 8000 },
  { title: "Billboard placement — 2 weeks", category: "Marketing", min: 30000, max: 65000 },
  { title: "Van wash & detailing", category: "Maintenance", min: 4000, max: 9000 },
  { title: "Barcode scanner batteries", category: "Equipment", min: 2500, max: 7000 },
  { title: "Fleet insurance premium", category: "Insurance", min: 45000, max: 78000 },
  { title: "Water dispenser lease", category: "Operations", min: 8000, max: 12000 },
  { title: "Casual loading labour", category: "Logistics", min: 12000, max: 28000 },
  { title: "Inventory app subscription", category: "Operations", min: 9900, max: 9900 },
];

const VENDORS = [
  "Metro Petrol Co",
  "GridWorks Utility",
  "ColdTech Services",
  "City Print House",
  "Bright Ad Agency",
  "Delta Staffing",
  "Polytrade Supply",
  "VendFlow Systems",
];

const NOTE_SNIPPETS = [
  "Client requested extra pallet drop at the back dock.",
  "Reordered on the spot — shelf was empty.",
  "Delivery window after 3pm.",
  "Signed by shift supervisor.",
  "Partial drop, balance follows tomorrow.",
  "Price matched against competitor invoice.",
];

const DEPARTMENTS = ["Field Sales", "Warehouse", "Van Route 3", "Cold Chain", "Retail Counter"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

let seedPromise: Promise<boolean> | null = null;

/** Idempotent demo-data bootstrap — runs once per process, skips when data exists. */
export function ensureSeeded() {
  seedPromise ??= runSeed().catch((error) => {
    console.error("[vendflow] seed failed", error);
    seedPromise = null; // let the next request retry instead of caching the failure forever
    return false;
  });
  return seedPromise;
}

type LiveProduct = CatalogueRow & {
  id: number;
  sku: string;
  qty: number;
};

async function runSeed() {
  const tables = await db.execute<{ exists: boolean }>(
    sql`select exists(select 1 from information_schema.tables where table_name = 'products') as exists`,
  );
  if (!tables.rows[0]?.exists) return false;

  const countResult = await db.execute<{ count: string }>(
    sql`select coalesce((select count(*) from products), 0)::text as count`,
  );
  if (Number(countResult.rows[0]?.count ?? 0) > 0) return false;

  /* A run that failed after inserting users but before products would otherwise
     collide on the unique email index on every retry — clear those orphans first. */
  const DEMO_EMAILS = ["demo@vendflow.app", "dani@vendflow.app", "kwame@vendflow.app"];
  const orphaned = await db.select({ id: users.id }).from(users).where(inArray(users.email, DEMO_EMAILS));
  if (orphaned.length) {
    const ids = orphaned.map((o) => o.id);
    await db.delete(sessions).where(inArray(sessions.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }

  const rand = mulberry32(20260417);
  const DAYS = 45;

  const userRows = await db
    .insert(users)
    .values([
      {
        email: "demo@vendflow.app",
        name: "Amara Okonkwo",
        role: "owner",
        territory: "Metro North",
        initials: "AO",
        hue: 158,
        passwordHash: hashPassword("demo1234"),
      },
      {
        email: "dani@vendflow.app",
        name: "Dani Ferrer",
        role: "manager",
        territory: "Riverside",
        initials: "DF",
        hue: 32,
        passwordHash: hashPassword("demo1234"),
      },
      {
        email: "kwame@vendflow.app",
        name: "Kwame Boateng",
        role: "rep",
        territory: "East Loop",
        initials: "KB",
        hue: 205,
        passwordHash: hashPassword("demo1234"),
      },
    ])
    .returning();

  const team = userRows.map((u) => ({ id: u.id, name: u.name }));

  const productRows = await db
    .insert(products)
    .values(
      CATALOGUE.map((row, i) => ({
        sku: `VF-${1200 + i * 7}`,
        name: row.name,
        category: row.category,
        unit: row.unit,
        costCents: row.costCents,
        priceCents: row.priceCents,
        stock: row.opening,
        reorderLevel: row.reorderLevel,
        bin: row.bin,
        supplier: row.supplier,
      })),
    )
    .returning();

  const live: LiveProduct[] = productRows.map((p, i) => ({
    ...p,
    ...CATALOGUE[i],
    qty: CATALOGUE[i].opening,
  }));

  const customerRows = await db
    .insert(customers)
    .values(
      CUSTOMER_SEED.map((c, i) => ({
        name: c.name,
        contactName: c.contactName,
        segment: c.segment,
        area: c.area,
        phone: `+1 (415) 55${i % 10}-${String(2000 + i * 37).padStart(4, "0")}`,
        email: `${c.contactName.split(" ")[0].toLowerCase()}@${c.name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}.example`,
        creditLimitCents: c.segment === "Key Account" ? 4_000_000 : c.segment === "Wholesale" ? 2_500_000 : 800_000,
        balanceCents: 0,
      })),
    )
    .returning();

  type MovementRow = typeof stockMovements.$inferInsert;
  const movements: MovementRow[] = [];
  const saleValues: (typeof sales.$inferInsert)[] = [];
  const pendingItems: (typeof saleItems.$inferInsert)[] = [];
  const expenseValues: (typeof expenses.$inferInsert)[] = [];
  const balances = new Map<number, number>(customerRows.map((c) => [c.id, 0]));

  let invoiceSeq = 24100;

  for (let offset = -DAYS; offset <= 0; offset++) {
    const dateISO = isoDate(offset);
    const weekday = new Date(`${dateISO}T12:00:00`).getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    for (const p of live) {
      if (offset !== 0 && (Math.abs(offset) + p.id * 3) % 10 === 0) {
        const received = int(
          rand,
          Math.max(10, Math.round(p.reorderLevel * 0.7)),
          Math.max(24, Math.round(p.reorderLevel * 2)),
        );
        p.qty += received;
        movements.push({
          productId: p.id,
          productName: p.name,
          type: "receipt",
          qtyChange: received,
          stockAfter: p.qty,
          reference: `GRN-${int(rand, 400, 899)}`,
          note: `Inbound from ${p.supplier}`,
          createdById: team[1].id,
          createdByName: team[1].name,
          createdAt: stamp(dateISO, 7, int(rand, 0, 55)),
        });
      }
    }

    // Random shrink: damaged cases written off keep the ledger realistic.
    if (chance(rand, 0.3)) {
      const victim = pick(rand, live);
      const lost = Math.min(victim.qty, int(rand, 1, 4));
      if (lost > 0) {
        victim.qty -= lost;
        movements.push({
          productId: victim.id,
          productName: victim.name,
          type: "damage",
          qtyChange: -lost,
          stockAfter: victim.qty,
          reference: `WRITE-${int(rand, 100, 499)}`,
          note: pick(rand, ["Crushed cases in the rack", "Expiry pull", "Leaking pallet, quarantined", "Count variance"]),
          createdById: team[2].id,
          createdByName: team[2].name,
          createdAt: stamp(dateISO, 18, int(rand, 0, 59)),
        });
      }
    }

    const salesToday = isWeekend ? int(rand, 1, 3) : int(rand, 3, 7);
    for (let s = 0; s < salesToday; s++) {
      const customer = pick(rand, customerRows);
      const soldBy = pick(rand, team);
      const lineCount = int(rand, 1, 5);
      const lines: { product: LiveProduct; qty: number }[] = [];
      const used = new Set<number>();

      for (let l = 0; l < lineCount; l++) {
        const product = pick(rand, live);
        if (used.has(product.id) || product.qty <= 0) continue;
        used.add(product.id);
        const qty = Math.min(product.qty, int(rand, 1, 14));
        if (qty <= 0) continue;
        lines.push({ product, qty });
      }
      if (!lines.length) continue;
      for (const line of lines) line.product.qty -= line.qty;

      const subtotal = lines.reduce((sum, l) => sum + l.qty * l.product.priceCents, 0);
      const cost = lines.reduce((sum, l) => sum + l.qty * l.product.costCents, 0);
      const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
      const wholesale = customer.segment === "Wholesale" || customer.segment === "Key Account";
      const channel = wholesale
        ? pick(rand, ["Wholesale", "Van"])
        : pick(rand, ["Counter", "Van", "Online"]);
      const discountCents = wholesale
        ? Math.round(subtotal * (chance(rand, 0.6) ? 0.05 : 0.025))
        : chance(rand, 0.25)
          ? Math.round(subtotal * 0.02)
          : 0;
      const taxCents = Math.round((subtotal - discountCents) * 0.075);
      const totalCents = subtotal - discountCents + taxCents;
      const invoiceNo = `INV-${invoiceSeq++}`;
      const status = chance(rand, 0.08)
        ? offset === 0
          ? "pending"
          : chance(rand, 0.4)
            ? "refunded"
            : "pending"
        : "completed";
      const paymentMethod = wholesale
        ? pick(rand, ["transfer", "credit", "transfer"])
        : pick(rand, ["cash", "card", "transfer", "cash"]);

      const itemCount = lines.length;
      saleValues.push({
        invoiceNo,
        customerId: customer.id,
        customerName: customer.name,
        channel,
        status,
        paymentMethod,
        subtotalCents: subtotal,
        discountCents,
        taxCents,
        totalCents,
        costCents: cost,
        totalQty,
        itemCount,
        note: chance(rand, 0.3) ? pick(rand, NOTE_SNIPPETS) : "",
        saleDate: dateISO,
        soldById: soldBy.id,
        soldByName: soldBy.name,
        createdAt: stamp(dateISO, isWeekend ? int(rand, 10, 15) : int(rand, 8, 18), int(rand, 0, 59)),
      });

      for (const line of lines) {
        pendingItems.push({
          saleId: -1,
          productId: line.product.id,
          productName: line.product.name,
          sku: line.product.sku,
          unit: line.product.unit,
          qty: line.qty,
          unitPriceCents: line.product.priceCents,
          lineTotalCents: line.qty * line.product.priceCents,
        });
      }

      if (status === "refunded") {
        for (const line of lines) {
          line.product.qty += line.qty;
          movements.push({
            productId: line.product.id,
            productName: line.product.name,
            type: "return",
            qtyChange: line.qty,
            stockAfter: line.product.qty,
            reference: invoiceNo,
            note: `Refunded — ${customer.name}`,
            createdById: soldBy.id,
            createdByName: soldBy.name,
            createdAt: stamp(dateISO, 13, int(rand, 0, 59)),
          });
        }
      } else {
        if (paymentMethod === "credit") {
          balances.set(customer.id, (balances.get(customer.id) ?? 0) + totalCents);
        }
        for (const line of lines) {
          movements.push({
            productId: line.product.id,
            productName: line.product.name,
            type: "sale",
            qtyChange: -line.qty,
            stockAfter: line.product.qty,
            reference: invoiceNo,
            note: `${customer.name} · ${channel}`,
            createdById: soldBy.id,
            createdByName: soldBy.name,
            createdAt: stamp(dateISO, 12, int(rand, 0, 59)),
          });
        }
      }
    }

    const expenseCount = isWeekend ? int(rand, 0, 1) : int(rand, 1, 3);
    for (let e = 0; e < expenseCount; e++) {
      const template = pick(rand, EXPENSE_TEMPLATES);
      const owner = pick(rand, team);
      expenseValues.push({
        title: template.title,
        category: template.category,
        vendor: pick(rand, VENDORS),
        amountCents: int(rand, template.min, template.max),
        paymentMethod: pick(rand, ["cash", "card", "transfer"]),
        expenseDate: dateISO,
        billable: chance(rand, 0.18),
        note: chance(rand, 0.3) ? pick(rand, NOTE_SNIPPETS) : "",
        createdById: owner.id,
        createdByName: owner.name,
        createdAt: stamp(dateISO, int(rand, 8, 18), int(rand, 0, 59)),
      });
    }
  }

  const insertedSales = await db.insert(sales).values(saleValues).returning({ id: sales.id });

  const itemsToInsert: (typeof saleItems.$inferInsert)[] = [];
  let cursor = 0;
  saleValues.forEach((sale, i) => {
    for (let k = 0; k < (sale.itemCount ?? 0); k++) {
      const item = pendingItems[cursor++];
      if (item) itemsToInsert.push({ ...item, saleId: insertedSales[i].id });
    }
  });
  for (let i = 0; i < itemsToInsert.length; i += 200) {
    await db.insert(saleItems).values(itemsToInsert.slice(i, i + 200));
  }

  for (const p of live) {
    await db
      .update(products)
      .set({ stock: Math.max(0, p.qty), updatedAt: new Date() })
      .where(sql`id = ${p.id}`);
  }

  for (let i = 0; i < movements.length; i += 250) {
    await db.insert(stockMovements).values(movements.slice(i, i + 250));
  }

  for (const [customerId, balance] of balances) {
    await db
      .update(customers)
      .set({ balanceCents: Math.max(0, balance) })
      .where(sql`id = ${customerId}`);
  }

  for (let i = 0; i < expenseValues.length; i += 200) {
    await db.insert(expenses).values(expenseValues.slice(i, i + 200));
  }

  /* ---------------- requisitions ---------------- */
  const reqSeeds: (typeof requisitions.$inferInsert)[] = [];
  const lowStock = live.filter((p) => p.qty <= p.reorderLevel * 1.4).slice(0, 8);

  lowStock.forEach((p, i) => {
    reqSeeds.push({
      reqNo: `REQ-${1180 + i}`,
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      unit: p.unit,
      requestedQty: Math.max(p.reorderLevel * 2 - p.qty, 20),
      approvedQty: 0,
      department: pick(rand, DEPARTMENTS),
      requester: pick(rand, team).name,
      priority: p.qty === 0 ? "urgent" : "high",
      status: "pending",
      neededBy: isoDate(int(rand, 1, 5)),
      notes: `On-hand ${p.qty} ${p.unit} vs reorder point ${p.reorderLevel}.`,
      createdAt: stamp(isoDate(-int(rand, 0, 3)), int(rand, 8, 17), int(rand, 0, 59)),
    });
  });

  const others = live.filter((p) => !lowStock.some((l) => l.id === p.id)).slice(0, 9);
  others.forEach((p, i) => {
    const decided = chance(rand, 0.85);
    const requested = int(rand, 12, 90);
    const roll = rand();
    const status = decided ? (roll < 0.44 ? "received" : roll < 0.78 ? "approved" : "rejected") : "pending";
    const approvedQty =
      status === "received" || status === "approved" ? Math.round(requested * (chance(rand, 0.62) ? 1 : 0.75)) : 0;
    reqSeeds.push({
      reqNo: `REQ-${1200 + i}`,
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      unit: p.unit,
      requestedQty: requested,
      approvedQty,
      department: pick(rand, DEPARTMENTS),
      requester: pick(rand, team).name,
      priority: pick(rand, PRIORITIES),
      status,
      neededBy: isoDate(int(rand, -6, 10)),
      notes: pick(rand, NOTE_SNIPPETS),
      decisionNote:
        status === "rejected"
          ? "Deferred — supplier lead time."
          : status === "approved"
            ? "Approved, waiting on the next inbound drop."
            : "Received and put away.",
      decidedBy: decided ? "Amara Okonkwo" : "",
      decidedAt: decided ? stamp(isoDate(-int(rand, 1, 12)), 15, 12) : null,
      createdAt: stamp(isoDate(-int(rand, 4, 26)), int(rand, 8, 17), int(rand, 0, 59)),
    });
  });

  await db.insert(requisitions).values(reqSeeds);

  return true;
}

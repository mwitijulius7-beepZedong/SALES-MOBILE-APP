import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Users & auth                                                        */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("rep"), // owner | manager | rep
    passwordHash: text("password_hash").notNull(),
    territory: text("territory").notNull().default("Central"),
    initials: text("initials").notNull().default("VF"),
    hue: integer("hue").notNull().default(158),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Catalog / inventory                                                 */
/* ------------------------------------------------------------------ */

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull().default("pc"),
    costCents: integer("cost_cents").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(10),
    bin: text("bin").notNull().default("A-01"),
    supplier: text("supplier").notNull().default("—"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_sku_uq").on(t.sku),
    index("products_category_idx").on(t.category),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    area: text("area").notNull().default("—"),
    segment: text("segment").notNull().default("Retail"), // Retail | Wholesale | Key Account
    creditLimitCents: integer("credit_limit_cents").notNull().default(0),
    balanceCents: integer("balance_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

/* ------------------------------------------------------------------ */
/* Sales                                                               */
/* ------------------------------------------------------------------ */

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    invoiceNo: text("invoice_no").notNull(),
    customerId: integer("customer_id"),
    customerName: text("customer_name").notNull().default("Walk-in"),
    channel: text("channel").notNull().default("Counter"), // Van | Counter | Wholesale | Online
    status: text("status").notNull().default("completed"), // completed | pending | refunded
    paymentMethod: text("payment_method").notNull().default("cash"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    totalQty: integer("total_qty").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    note: text("note").notNull().default(""),
    saleDate: date("sale_date").notNull(),
    soldById: integer("sold_by_id"),
    soldByName: text("sold_by_name").notNull().default("System"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sales_invoice_uq").on(t.invoiceNo),
    index("sales_date_idx").on(t.saleDate),
    index("sales_status_idx").on(t.status),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id").notNull(),
    productId: integer("product_id"),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull().default(""),
    unit: text("unit").notNull().default("pc"),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull().default(0),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull().default("Operations"),
    vendor: text("vendor").notNull().default("—"),
    amountCents: integer("amount_cents").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("cash"),
    expenseDate: date("expense_date").notNull(),
    billable: boolean("billable").notNull().default(false),
    note: text("note").notNull().default(""),
    createdById: integer("created_by_id"),
    createdByName: text("created_by_name").notNull().default("System"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.expenseDate)],
);

/* ------------------------------------------------------------------ */
/* Stock movements                                                     */
/* ------------------------------------------------------------------ */

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    productName: text("product_name").notNull(),
    type: text("type").notNull(), // receipt | sale | adjustment | return | requisition
    qtyChange: integer("qty_change").notNull(),
    stockAfter: integer("stock_after").notNull().default(0),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    createdById: integer("created_by_id"),
    createdByName: text("created_by_name").notNull().default("System"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("movements_product_idx").on(t.productId)],
);

/* ------------------------------------------------------------------ */
/* Requisitions                                                        */
/* ------------------------------------------------------------------ */

export const requisitions = pgTable(
  "requisitions",
  {
    id: serial("id").primaryKey(),
    reqNo: text("req_no").notNull(),
    productId: integer("product_id"),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull().default(""),
    unit: text("unit").notNull().default("pc"),
    requestedQty: integer("requested_qty").notNull().default(1),
    approvedQty: integer("approved_qty").notNull().default(0),
    department: text("department").notNull().default("Field Sales"),
    requester: text("requester").notNull().default(""),
    priority: text("priority").notNull().default("normal"), // low | normal | high | urgent
    status: text("status").notNull().default("pending"), // pending | approved | rejected | received
    neededBy: date("needed_by"),
    notes: text("notes").notNull().default(""),
    decisionNote: text("decision_note").notNull().default(""),
    decidedBy: text("decided_by").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("requisitions_no_uq").on(t.reqNo),
    index("requisitions_status_idx").on(t.status),
  ],
);

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Requisition = typeof requisitions.$inferSelect;

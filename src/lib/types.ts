export type ProductRow = {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  costCents: number;
  priceCents: number;
  stock: number;
  reorderLevel: number;
  bin: string;
  supplier: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  soldQty30d?: number;
  soldRevenue30d?: number;
  marginCents?: number;
  marginPct?: number;
  stockValueCents?: number;
  status?: "healthy" | "low" | "out";
  movements?: MovementRow[];
};

export type MovementRow = {
  id: number;
  productId: number;
  productName: string;
  type: string;
  qtyChange: number;
  stockAfter: number;
  reference: string;
  note: string;
  createdByName: string;
  createdAt: string;
};

export type SaleItemRow = {
  id?: number;
  saleId?: number;
  productId: number | null;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type SaleRow = {
  id: number;
  invoiceNo: string;
  customerId: number | null;
  customerName: string;
  channel: string;
  status: "completed" | "pending" | "refunded";
  paymentMethod: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  costCents: number;
  totalQty: number;
  itemCount: number;
  note: string;
  saleDate: string;
  soldById: number | null;
  soldByName: string;
  createdAt: string;
  items?: SaleItemRow[];
};

export type ExpenseRow = {
  id: number;
  title: string;
  category: string;
  vendor: string;
  amountCents: number;
  paymentMethod: string;
  expenseDate: string;
  billable: boolean;
  note: string;
  createdByName: string;
  createdAt: string;
};

export type RequisitionRow = {
  id: number;
  reqNo: string;
  productId: number | null;
  productName: string;
  sku: string;
  unit: string;
  requestedQty: number;
  approvedQty: number;
  department: string;
  requester: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "approved" | "rejected" | "received";
  neededBy: string | null;
  notes: string;
  decisionNote: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
};

export type CustomerRow = {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  area: string;
  segment: string;
  creditLimitCents: number;
  balanceCents: number;
  createdAt: string;
  lifetimeCents?: number;
  orders?: number;
  lastOrder?: string;
  creditUsagePct?: number;
};

export type DashboardData = {
  today: {
    revenue: number;
    pending: number;
    cost: number;
    grossProfit: number;
    marginPct: number;
    orders: number;
    completedOrders: number;
    units: number;
    avgBasket: number;
    expenses: number;
    expenseCount: number;
    netCash: number;
    deltaRevenue: number;
  };
  month: { revenue: number; orders: number; expenses: number; netCash: number; prevRevenue: number; marginPct: number };
  stock: { skus: number; units: number; costValue: number; retailValue: number; low: number; out: number };
  series: { date: string; revenue: number; orders: number; expenses: number }[];
  payments: { label: string; value: number }[];
  categories: { label: string; value: number; units: number }[];
  recentSales: SaleRow[];
  lowStock: ProductRow[];
  pendingRequisitions: number;
  movements: MovementRow[];
};

export type ReportData = {
  range: { from: string; to: string };
  totals: {
    revenue: number;
    pending: number;
    cost: number;
    grossProfit: number;
    marginPct: number;
    orders: number;
    completedOrders: number;
    units: number;
    avgBasket: number;
    expenses: number;
    expenseCount: number;
    netCash: number;
  };
  timeline: { date: string; revenue: number; cost: number; expenses: number; orders: number }[];
  salesByProduct: { productId: number | null; name: string; sku: string; qty: number; revenue: number }[];
  stock: {
    id: number;
    sku: string;
    name: string;
    category: string;
    unit: string;
    stock: number;
    reorderLevel: number;
    costCents: number;
    priceCents: number;
    bin: string;
    supplier: string;
    costValue: number;
    retailValue: number;
    potential: number;
    status: "healthy" | "low" | "out";
  }[];
  movements: MovementRow[];
  receivables: CustomerRow[];
};

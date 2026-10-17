/**
 * OpenAPI 3.1 description of the versioned `/api/v1` surface.
 *
 * Served (unauthenticated) at GET /api/v1/openapi. Kept as a plain object so it
 * can also be dumped to a file or imported into tooling.
 */

const pagedMeta = {
  type: "object",
  required: ["page", "limit", "hasMore"],
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1 },
    hasMore: { type: "boolean" },
  },
} as const;

const errorBody = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "bad_request" },
        message: { type: "string" },
      },
    },
  },
} as const;

function pagedEnvelope(itemRef: string) {
  return {
    type: "object",
    required: ["data", "meta"],
    properties: {
      data: { type: "array", items: { $ref: itemRef } },
      meta: pagedMeta,
    },
  };
}

function envelope(dataRef: string) {
  return {
    type: "object",
    required: ["data"],
    properties: { data: { $ref: dataRef } },
  };
}

const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
];

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "VendFlow API",
    version: "1.0.0",
    description:
      "Field sales, inventory, expense and requisition API. Authenticate with a Bearer token (native/mobile) or the `vf_session` cookie (web). All money values are integer cents.",
  },
  servers: [{ url: "/api/v1", description: "Versioned API" }],
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  tags: [
    { name: "Auth" },
    { name: "Sales" },
    { name: "Products" },
    { name: "Customers" },
    { name: "Expenses" },
    { name: "Requisitions" },
    { name: "Inventory" },
    { name: "Analytics" },
    { name: "Meta" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Meta"],
        summary: "Service/database health",
        security: [],
        responses: {
          "200": {
            description: "Healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { ok: { type: "boolean" }, version: { type: "string" }, time: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          "503": { description: "Database unavailable", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/openapi": {
      get: {
        tags: ["Meta"],
        summary: "This OpenAPI document",
        security: [],
        responses: { "200": { description: "OpenAPI JSON" } },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create a rep account and obtain a session token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 2 },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  territory: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Registered", content: { "application/json": { schema: envelope("#/components/schemas/AuthResult") } } },
          "400": { description: "Validation error", content: { "application/json": { schema: errorBody } } },
          "409": { description: "Email already used", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Exchange credentials for a session token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Signed in", content: { "application/json": { schema: envelope("#/components/schemas/AuthResult") } } },
          "401": { description: "Bad credentials", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Destroy the current session (cookie or Bearer)",
        responses: { "200": { description: "Signed out" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current authenticated user",
        responses: {
          "200": { description: "Current user", content: { "application/json": { schema: envelope("#/components/schemas/User") } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/sales": {
      get: {
        tags: ["Sales"],
        summary: "List sales with line items",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Match invoice, customer or seller" },
          { name: "status", in: "query", schema: { type: "string", enum: ["all", "completed", "pending", "refunded"] } },
          { name: "method", in: "query", schema: { type: "string", enum: ["all", "cash", "card", "transfer", "credit"] } },
          { name: "range", in: "query", schema: { type: "string", example: "30d" } },
          ...pageParams,
        ],
        responses: {
          "200": { description: "Paginated sales", content: { "application/json": { schema: pagedEnvelope("#/components/schemas/Sale") } } },
        },
      },
      post: {
        tags: ["Sales"],
        summary: "Record a sale (stock + ledger updated atomically)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["lines"],
                properties: {
                  lines: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["productId", "qty"],
                      properties: { productId: { type: "integer" }, qty: { type: "integer", minimum: 1 } },
                    },
                  },
                  customerId: { type: ["integer", "null"] },
                  customerName: { type: "string", default: "Walk-in" },
                  channel: { type: "string", enum: ["Van", "Counter", "Wholesale", "Online"] },
                  paymentMethod: { type: "string", enum: ["cash", "card", "transfer", "credit"] },
                  discountCents: { type: "integer", minimum: 0 },
                  applyTax: { type: "boolean", default: true },
                  saleDate: { type: "string", format: "date" },
                  status: { type: "string", enum: ["completed", "pending"] },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Created", content: { "application/json": { schema: envelope("#/components/schemas/Sale") } } },
          "400": { description: "Validation error", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/sales/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      get: {
        tags: ["Sales"],
        summary: "Get a sale",
        responses: {
          "200": { description: "Sale", content: { "application/json": { schema: envelope("#/components/schemas/Sale") } } },
          "404": { description: "Not found", content: { "application/json": { schema: errorBody } } },
        },
      },
      patch: {
        tags: ["Sales"],
        summary: "Change sale status (owner/manager only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["completed", "pending", "refunded"] } } },
            },
          },
        },
        responses: {
          "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Sale") } } },
          "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } },
        },
      },
      delete: {
        tags: ["Sales"],
        summary: "Void a sale (owner/manager only)",
        responses: {
          "200": { description: "Voided" },
          "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/products": {
      get: {
        tags: ["Products"],
        summary: "List products with 30-day sales enrichment",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["all", "healthy", "low", "out"] } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["price", "margin", "stock", "updated"] } },
          ...pageParams,
        ],
        responses: {
          "200": { description: "Paginated products", content: { "application/json": { schema: pagedEnvelope("#/components/schemas/Product") } } },
        },
      },
      post: {
        tags: ["Products"],
        summary: "Create a product",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } },
        },
        responses: {
          "200": { description: "Created", content: { "application/json": { schema: envelope("#/components/schemas/Product") } } },
          "400": { description: "Validation error", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/products/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      get: {
        tags: ["Products"],
        summary: "Get a product with recent stock movements",
        responses: {
          "200": { description: "Product", content: { "application/json": { schema: envelope("#/components/schemas/Product") } } },
          "404": { description: "Not found", content: { "application/json": { schema: errorBody } } },
        },
      },
      put: {
        tags: ["Products"],
        summary: "Replace a product",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Product") } } } },
      },
      patch: {
        tags: ["Products"],
        summary: "Update a product (alias of PUT)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Product") } } } },
      },
      delete: {
        tags: ["Products"],
        summary: "Delete or archive a product (owner/manager only)",
        responses: {
          "200": { description: "Deleted or archived" },
          "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } },
        },
      },
    },
    "/customers": {
      get: {
        tags: ["Customers"],
        summary: "List customers with lifetime metrics",
        parameters: [{ name: "q", in: "query", schema: { type: "string" } }, ...pageParams],
        responses: {
          "200": { description: "Paginated customers", content: { "application/json": { schema: pagedEnvelope("#/components/schemas/Customer") } } },
        },
      },
      post: {
        tags: ["Customers"],
        summary: "Create a customer",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerInput" } } } },
        responses: { "200": { description: "Created", content: { "application/json": { schema: envelope("#/components/schemas/Customer") } } } },
      },
    },
    "/customers/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      put: {
        tags: ["Customers"],
        summary: "Update a customer",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerInput" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Customer") } } } },
      },
      patch: {
        tags: ["Customers"],
        summary: "Update a customer (alias of PUT)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerInput" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Customer") } } } },
      },
      delete: {
        tags: ["Customers"],
        summary: "Delete a customer (owner/manager only)",
        responses: { "200": { description: "Deleted" }, "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } } },
      },
    },
    "/expenses": {
      get: {
        tags: ["Expenses"],
        summary: "List expenses with summary + category breakdown",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "range", in: "query", schema: { type: "string", example: "30d" } },
          ...pageParams,
        ],
        responses: {
          "200": {
            description: "Paginated expenses",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Expense" } }, meta: pagedMeta } } } },
          },
        },
      },
      post: {
        tags: ["Expenses"],
        summary: "Create an expense",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExpenseInput" } } } },
        responses: { "200": { description: "Created", content: { "application/json": { schema: envelope("#/components/schemas/Expense") } } } },
      },
    },
    "/expenses/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      put: {
        tags: ["Expenses"],
        summary: "Update an expense",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExpenseInput" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Expense") } } } },
      },
      patch: {
        tags: ["Expenses"],
        summary: "Update an expense (alias of PUT)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ExpenseInput" } } } },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Expense") } } } },
      },
      delete: {
        tags: ["Expenses"],
        summary: "Delete an expense (owner/manager only)",
        responses: { "200": { description: "Deleted" }, "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } } },
      },
    },
    "/requisitions": {
      get: {
        tags: ["Requisitions"],
        summary: "List requisitions (priority order) with status counts",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["all", "pending", "approved", "rejected", "received"] } },
          ...pageParams,
        ],
        responses: {
          "200": {
            description: "Paginated requisitions",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Requisition" } }, meta: pagedMeta } } } },
          },
        },
      },
      post: {
        tags: ["Requisitions"],
        summary: "Raise a requisition",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "requestedQty"],
                properties: {
                  productId: { type: "integer" },
                  requestedQty: { type: "integer", minimum: 1 },
                  department: { type: "string" },
                  requester: { type: "string" },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                  neededBy: { type: "string", format: "date" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Created", content: { "application/json": { schema: envelope("#/components/schemas/Requisition") } } } },
      },
    },
    "/requisitions/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      get: {
        tags: ["Requisitions"],
        summary: "Get a requisition",
        responses: { "200": { description: "Requisition", content: { "application/json": { schema: envelope("#/components/schemas/Requisition") } } } },
      },
      patch: {
        tags: ["Requisitions"],
        summary: "Approve / reject / receive (owner/manager only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["pending", "approved", "rejected", "received"] },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Decided", content: { "application/json": { schema: envelope("#/components/schemas/Requisition") } } } },
      },
      put: {
        tags: ["Requisitions"],
        summary: "Edit an open requisition",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["requestedQty"],
                properties: {
                  requestedQty: { type: "integer", minimum: 1 },
                  priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                  department: { type: "string" },
                  requester: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated", content: { "application/json": { schema: envelope("#/components/schemas/Requisition") } } } },
      },
      delete: {
        tags: ["Requisitions"],
        summary: "Delete a requisition (owner/manager only)",
        responses: { "200": { description: "Deleted" }, "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } } },
      },
    },
    "/stock/adjust": {
      post: {
        tags: ["Inventory"],
        summary: "Adjust stock (owner/manager only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "qtyChange"],
                properties: {
                  productId: { type: "integer" },
                  qtyChange: { type: "integer" },
                  reason: { type: "string", enum: ["receipt", "adjustment", "return", "damage", "count", "requisition"] },
                  reference: { type: "string" },
                  note: { type: "string" },
                  mode: { type: "string", enum: ["delta", "set"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Movement recorded" }, "403": { description: "Forbidden", content: { "application/json": { schema: errorBody } } } },
      },
    },
    "/dashboard": {
      get: {
        tags: ["Analytics"],
        summary: "Aggregated dashboard payload",
        responses: { "200": { description: "Dashboard", content: { "application/json": { schema: envelope("#/components/schemas/Dashboard") } } } },
      },
    },
    "/reports": {
      get: {
        tags: ["Analytics"],
        summary: "Range report",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: { "200": { description: "Report", content: { "application/json": { schema: envelope("#/components/schemas/Report") } } } },
      },
    },
    "/reference": {
      get: {
        tags: ["Analytics"],
        summary: "Reference/lookup lists",
        responses: { "200": { description: "Reference data" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque", description: "Session token from /auth/login or /auth/register" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "vf_session" },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string", enum: ["owner", "manager", "rep"] },
          territory: { type: "string" },
          initials: { type: "string" },
          hue: { type: "integer" },
        },
      },
      AuthResult: {
        type: "object",
        properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" } },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "integer" },
          sku: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          unit: { type: "string" },
          costCents: { type: "integer" },
          priceCents: { type: "integer" },
          stock: { type: "integer" },
          reorderLevel: { type: "integer" },
          bin: { type: "string" },
          supplier: { type: "string" },
          active: { type: "boolean" },
          status: { type: "string", enum: ["healthy", "low", "out"] },
          soldQty30d: { type: "integer" },
          soldRevenue30d: { type: "integer" },
          marginCents: { type: "integer" },
          marginPct: { type: "number" },
          stockValueCents: { type: "integer" },
          movements: { type: "array", items: { $ref: "#/components/schemas/Movement" } },
        },
      },
      ProductInput: {
        type: "object",
        required: ["name", "priceCents"],
        properties: {
          sku: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          unit: { type: "string" },
          costCents: { type: "integer", minimum: 0 },
          priceCents: { type: "integer", minimum: 1 },
          stock: { type: "integer", minimum: 0 },
          reorderLevel: { type: "integer", minimum: 0 },
          bin: { type: "string" },
          supplier: { type: "string" },
          active: { type: "boolean" },
        },
      },
      SaleItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          productId: { type: ["integer", "null"] },
          productName: { type: "string" },
          sku: { type: "string" },
          unit: { type: "string" },
          qty: { type: "integer" },
          unitPriceCents: { type: "integer" },
          lineTotalCents: { type: "integer" },
        },
      },
      Sale: {
        type: "object",
        properties: {
          id: { type: "integer" },
          invoiceNo: { type: "string" },
          customerId: { type: ["integer", "null"] },
          customerName: { type: "string" },
          channel: { type: "string", enum: ["Van", "Counter", "Wholesale", "Online"] },
          status: { type: "string", enum: ["completed", "pending", "refunded"] },
          paymentMethod: { type: "string", enum: ["cash", "card", "transfer", "credit"] },
          subtotalCents: { type: "integer" },
          discountCents: { type: "integer" },
          taxCents: { type: "integer" },
          totalCents: { type: "integer" },
          costCents: { type: "integer" },
          totalQty: { type: "integer" },
          itemCount: { type: "integer" },
          note: { type: "string" },
          saleDate: { type: "string", format: "date" },
          soldById: { type: ["integer", "null"] },
          soldByName: { type: "string" },
          items: { type: "array", items: { $ref: "#/components/schemas/SaleItem" } },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          contactName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          area: { type: "string" },
          segment: { type: "string", enum: ["Retail", "Wholesale", "Key Account"] },
          creditLimitCents: { type: "integer" },
          balanceCents: { type: "integer" },
          lifetimeCents: { type: "integer" },
          orders: { type: "integer" },
          lastOrder: { type: "string" },
          creditUsagePct: { type: "number" },
        },
      },
      CustomerInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          contactName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          area: { type: "string" },
          segment: { type: "string", enum: ["Retail", "Wholesale", "Key Account"] },
          creditLimitCents: { type: "integer", minimum: 0 },
        },
      },
      Expense: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          category: { type: "string" },
          vendor: { type: "string" },
          amountCents: { type: "integer" },
          paymentMethod: { type: "string" },
          expenseDate: { type: "string", format: "date" },
          billable: { type: "boolean" },
          note: { type: "string" },
          createdByName: { type: "string" },
        },
      },
      ExpenseInput: {
        type: "object",
        required: ["title", "amountCents"],
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          vendor: { type: "string" },
          amountCents: { type: "integer", minimum: 1 },
          paymentMethod: { type: "string", enum: ["cash", "card", "transfer", "credit"] },
          expenseDate: { type: "string", format: "date" },
          billable: { type: "boolean" },
          note: { type: "string" },
        },
      },
      Requisition: {
        type: "object",
        properties: {
          id: { type: "integer" },
          reqNo: { type: "string" },
          productId: { type: ["integer", "null"] },
          productName: { type: "string" },
          sku: { type: "string" },
          unit: { type: "string" },
          requestedQty: { type: "integer" },
          approvedQty: { type: "integer" },
          department: { type: "string" },
          requester: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          status: { type: "string", enum: ["pending", "approved", "rejected", "received"] },
          neededBy: { type: ["string", "null"], format: "date" },
          notes: { type: "string" },
          decisionNote: { type: "string" },
          decidedBy: { type: "string" },
          decidedAt: { type: ["string", "null"] },
        },
      },
      Movement: {
        type: "object",
        properties: {
          id: { type: "integer" },
          productId: { type: "integer" },
          productName: { type: "string" },
          type: { type: "string" },
          qtyChange: { type: "integer" },
          stockAfter: { type: "integer" },
          reference: { type: "string" },
          note: { type: "string" },
          createdByName: { type: "string" },
          createdAt: { type: "string" },
        },
      },
      Dashboard: { type: "object", description: "Aggregate of today/month stats, 14-day series, payments, categories, stock summary, recent sales, low stock, pending requisitions and movements." },
      Report: { type: "object", description: "Range totals, timeline, sales-by-product, stock table, movements and receivables." },
    },
  },
} as const;

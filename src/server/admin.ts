import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, auditLog, categories, sessions, settings, users } from "@/db/schema";
import { HttpError, hashPassword, initialsOf } from "@/lib/auth";

type Actor = { id: number; name: string };

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export function auditRow(entry: {
  actor: Actor;
  action: string;
  entity: string;
  entityId?: number | null;
  detail?: string;
}) {
  return {
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    detail: (entry.detail ?? "").slice(0, 500),
  };
}

export async function writeAudit(entry: Parameters<typeof auditRow>[0]) {
  await db.insert(auditLog).values(auditRow(entry));
}

export async function listAudit(params: {
  entity?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params.entity) conditions.push(eq(auditLog.entity, params.entity));
  if (params.action) conditions.push(eq(auditLog.action, params.action));
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const fetched = await db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1)
    .offset(offset);
  const hasMore = fetched.length > limit;
  if (hasMore) fetched.pop();
  return { rows: fetched, hasMore };
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  currency: "USD",
  taxRatePct: 7.5,
  expenseApprovals: false,
  lowStockAlerts: true,
};

function coerceSetting(key: string, value: unknown): unknown {
  const fallback = DEFAULT_SETTINGS[key];
  if (typeof fallback === "boolean") {
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
  }
  if (typeof fallback === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new HttpError(`${key} must be a number`);
    return n;
  }
  if (value === null || value === undefined) throw new HttpError(`${key} is required`);
  return String(value).slice(0, 120);
}

export async function getSettings() {
  const rows = await db.select().from(settings);
  const map: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function updateSettings(patch: Record<string, unknown>, actor: Actor) {
  const entries = Object.entries(patch).filter(([key]) => key in DEFAULT_SETTINGS);
  if (!entries.length) throw new HttpError("No recognised settings in body");
  for (const [key] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) throw new HttpError(`Unknown setting: ${key}`);
  }
  for (const [key, raw] of entries) {
    const value = coerceSetting(key, raw);
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }
  await writeAudit({
    actor,
    action: "settings.update",
    entity: "settings",
    detail: entries.map(([k]) => k).join(", "),
  });
  return getSettings();
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export const CATEGORY_KINDS = ["expense", "product"] as const;

export async function listCategories(kind?: string) {
  const condition = kind && kind !== "all" ? eq(categories.kind, kind) : undefined;
  return db.select().from(categories).where(condition).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function createCategory(
  data: { kind: string; name: string; sortOrder?: number },
  actor: Actor,
) {
  if (!CATEGORY_KINDS.includes(data.kind as (typeof CATEGORY_KINDS)[number])) {
    throw new HttpError(`kind must be one of: ${CATEGORY_KINDS.join(", ")}`);
  }
  const name = data.name.trim();
  if (!name) throw new HttpError("name is required");
  const clash = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, name), eq(categories.kind, data.kind)))
    .limit(1);
  if (clash.length) throw new HttpError(`"${name}" is already on the ${data.kind} list`, 409);
  const [row] = await db
    .insert(categories)
    .values({ kind: data.kind, name, sortOrder: data.sortOrder ?? 0 })
    .returning();
  await writeAudit({ actor, action: "category.create", entity: "category", entityId: row.id, detail: `${data.kind}: ${name}` });
  return row;
}

export async function updateCategory(
  id: number,
  patch: { name?: string; sortOrder?: number; active?: boolean },
  actor: Actor,
) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw new HttpError("Category not found", 404);
  const set: Partial<typeof categories.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new HttpError("name cannot be empty");
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, name), eq(categories.kind, existing.kind)))
      .limit(1);
    if (clash.length && clash[0].id !== id) throw new HttpError(`"${name}" is already on the list`, 409);
    set.name = name;
  }
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.active !== undefined) set.active = patch.active;
  const [row] = await db.update(categories).set(set).where(eq(categories.id, id)).returning();
  if (!row) throw new HttpError("Category not found", 404);
  await writeAudit({ actor, action: "category.update", entity: "category", entityId: id, detail: row.name });
  return row;
}

export async function deleteCategory(id: number, actor: Actor) {
  const [row] = await db.delete(categories).where(eq(categories.id, id)).returning();
  if (!row) throw new HttpError("Category not found", 404);
  await writeAudit({ actor, action: "category.delete", entity: "category", entityId: id, detail: row.name });
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

const USER_ROLES = ["owner", "manager", "rep"] as const;

export function publicUser(row: typeof users.$inferSelect) {
  const { passwordHash: _hash, ...rest } = row;
  return rest;
}

export async function listUsers() {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return rows.map(publicUser);
}

export async function createUser(
  data: { name: string; email: string; password: string; role?: string; territory?: string },
  actor: Actor & { role: string },
) {
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const role = (data.role ?? "rep").trim();
  if (name.length < 2) throw new HttpError("Tell us their full name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError("That email address looks invalid");
  if (data.password.length < 8) throw new HttpError("Use at least 8 characters for the password");
  if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
    throw new HttpError(`role must be one of: ${USER_ROLES.join(", ")}`);
  }
  if (role === "owner" && actor.role !== "owner") throw new HttpError("Only an owner can create owners", 403);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new HttpError("An account already uses that email", 409);

  const [row] = await db
    .insert(users)
    .values({
      name,
      email,
      role,
      territory: (data.territory ?? "Central").slice(0, 40),
      initials: initialsOf(name) || "VF",
      hue: Math.floor(Math.random() * 360),
      passwordHash: hashPassword(data.password),
    })
    .returning();
  await writeAudit({ actor, action: "user.create", entity: "user", entityId: row.id, detail: `${name} (${role})` });
  return publicUser(row);
}

export async function updateUser(
  id: number,
  patch: { name?: string; role?: string; territory?: string; active?: boolean; password?: string },
  actor: Actor & { role: string },
) {
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) throw new HttpError("User not found", 404);

  const set: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) throw new HttpError("Name looks too short");
    set.name = name;
    set.initials = initialsOf(name) || target.initials;
  }
  if (patch.territory !== undefined) set.territory = patch.territory.slice(0, 40);
  if (patch.password !== undefined) {
    if (patch.password.length < 8) throw new HttpError("Use at least 8 characters for the password");
    set.passwordHash = hashPassword(patch.password);
  }
  if (patch.role !== undefined) {
    if (actor.role !== "owner") throw new HttpError("Only an owner can change roles", 403);
    if (!USER_ROLES.includes(patch.role as (typeof USER_ROLES)[number])) {
      throw new HttpError(`role must be one of: ${USER_ROLES.join(", ")}`);
    }
    if (id === actor.id) throw new HttpError("You can't change your own role");
    set.role = patch.role;
  }
  if (patch.active !== undefined) {
    if (id === actor.id && !patch.active) throw new HttpError("You can't deactivate your own account");
    set.active = patch.active;
  }

  const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
  if (set.active === false || patch.password !== undefined) {
    await db.delete(sessions).where(eq(sessions.userId, id));
  }
  await writeAudit({
    actor,
    action: "user.update",
    entity: "user",
    entityId: id,
    detail: Object.keys(patch).join(", "),
  });
  return publicUser(row);
}

export async function deleteUser(id: number, actor: Actor & { role: string }) {
  if (id === actor.id) throw new HttpError("You can't delete your own account");
  const [row] = await db.delete(users).where(eq(users.id, id)).returning();
  if (!row) throw new HttpError("User not found", 404);
  await db.delete(sessions).where(eq(sessions.userId, id));
  await writeAudit({ actor, action: "user.delete", entity: "user", entityId: id, detail: row.name });
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Uploads (attachments)                                               */
/* ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_ENTITIES = ["expense", "requisition", "customer", "general"] as const;

function safeFilename(name: string) {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return cleaned || "upload.bin";
}

export function attachmentMeta(row: typeof attachments.$inferSelect) {
  const { data: _bytes, ...rest } = row;
  return rest;
}

export async function createAttachment(
  input: {
    filename: string;
    mimeType?: string;
    contentBase64: string;
    entity?: string;
    entityId?: number | null;
  },
  actor: Actor,
) {
  const entity = input.entity && ATTACHMENT_ENTITIES.includes(input.entity as (typeof ATTACHMENT_ENTITIES)[number])
    ? input.entity
    : "general";
  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.contentBase64, "base64");
  } catch {
    throw new HttpError("contentBase64 is not valid base64");
  }
  if (!buffer.length) throw new HttpError("That file is empty");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(`Files must be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`);
  }
  const [row] = await db
    .insert(attachments)
    .values({
      filename: safeFilename(input.filename),
      mimeType: (input.mimeType ?? "application/octet-stream").slice(0, 120),
      sizeBytes: buffer.length,
      data: buffer,
      entity,
      entityId: input.entityId ?? null,
      uploadedById: actor.id,
      uploadedByName: actor.name,
    })
    .returning();
  return attachmentMeta(row);
}

export async function listAttachments(params: { entity?: string; entityId?: number }) {
  const conditions = [];
  if (params.entity) conditions.push(eq(attachments.entity, params.entity));
  if (params.entityId !== undefined) conditions.push(eq(attachments.entityId, params.entityId));
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      entity: attachments.entity,
      entityId: attachments.entityId,
      uploadedByName: attachments.uploadedByName,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(attachments.createdAt));
  return rows;
}

export async function getAttachment(id: number) {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!row) throw new HttpError("Attachment not found", 404);
  return row;
}

export async function deleteAttachment(id: number, actor: Actor) {
  const [row] = await db.delete(attachments).where(eq(attachments.id, id)).returning();
  if (!row) throw new HttpError("Attachment not found", 404);
  await writeAudit({
    actor,
    action: "attachment.delete",
    entity: row.entity,
    entityId: row.entityId,
    detail: row.filename,
  });
  return { deleted: true };
}

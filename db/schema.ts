import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    state: text("state").notNull().default("GOAL_SETTING"),
    goal: text("goal"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [uniqueIndex("idx_rooms_code").on(table.code)],
);

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    role: text("role", { enum: ["A", "B"] }).notNull(),
    displayName: text("display_name").notNull(),
    tokenHash: text("token_hash").notNull(),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_participants_room_role").on(table.roomId, table.role),
    uniqueIndex("idx_participants_token_hash").on(table.tokenHash),
  ],
);

export const privateDrafts = sqliteTable(
  "private_drafts",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    participantId: text("participant_id").notNull(),
    transcript: text("transcript").notNull(),
    clarification: text("clarification"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_private_drafts_owner").on(table.roomId, table.participantId)],
);

export const perspectives = sqliteTable(
  "perspectives",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull(),
    participantId: text("participant_id").notNull(),
    version: integer("version").notNull().default(1),
    fact: text("fact").notNull(),
    meaning: text("meaning").notNull(),
    impact: text("impact").notNull(),
    request: text("request").notNull(),
    approvedAt: text("approved_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_perspectives_owner_version").on(
      table.roomId,
      table.participantId,
      table.version,
    ),
  ],
);

export const sharedViews = sqliteTable("shared_views", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().unique(),
  version: integer("version").notNull().default(1),
  commonGround: text("common_ground").notNull(),
  disagreement: text("disagreement").notNull(),
  coreQuestion: text("core_question").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agreements = sqliteTable("agreements", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().unique(),
  proposal: text("proposal").notNull(),
  reviewAt: text("review_at").notNull(),
  acceptedA: integer("accepted_a", { mode: "boolean" }).notNull().default(false),
  acceptedB: integer("accepted_b", { mode: "boolean" }).notNull().default(false),
  activatedAt: text("activated_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const roomEvents = sqliteTable(
  "room_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: text("room_id").notNull(),
    participantId: text("participant_id"),
    eventType: text("event_type").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    payload: text("payload").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_room_events_timeline").on(table.roomId, table.id)],
);

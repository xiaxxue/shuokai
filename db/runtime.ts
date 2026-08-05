import { getD1 } from ".";

let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  if (!schemaReady) schemaReady = initializeSchema();
  return schemaReady;
}

async function initializeSchema() {
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'GOAL_SETTING',
      goal TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('A', 'B')),
      display_name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, role)
    )`,
    `CREATE TABLE IF NOT EXISTS private_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      transcript TEXT NOT NULL,
      clarification TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS perspectives (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      fact TEXT NOT NULL,
      meaning TEXT NOT NULL,
      impact TEXT NOT NULL,
      request TEXT NOT NULL,
      approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, participant_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS shared_views (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      common_ground TEXT NOT NULL,
      disagreement TEXT NOT NULL,
      core_question TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS agreements (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL UNIQUE,
      proposal TEXT NOT NULL,
      review_at TEXT NOT NULL,
      accepted_a INTEGER NOT NULL DEFAULT 0,
      accepted_b INTEGER NOT NULL DEFAULT 0,
      activated_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS room_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      room_id TEXT NOT NULL,
      participant_id TEXT,
      event_type TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_room_role ON participants(room_id, role)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_token_hash ON participants(token_hash)",
    "CREATE INDEX IF NOT EXISTS idx_private_drafts_owner ON private_drafts(room_id, participant_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_perspectives_owner_version ON perspectives(room_id, participant_id, version)",
    "CREATE INDEX IF NOT EXISTS idx_room_events_timeline ON room_events(room_id, id)",
  ];
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

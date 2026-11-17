import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

export type Message = {
  id: number;
  uid: string;
  type: "text" | "photo" | "voice" | "drawing";
  text: string;
  file: string | null;
  created_at: number;
  pinned: number;
  updated_at: number;
  deleted: number;
};

export type Event = {
  id: number;
  uid: string;
  title: string;
  date: string; // like 2026-11-20
};

type DirtyMessage = Message & { dirty: number };
type DirtyEvent = Event & {
  created_at: number;
  updated_at: number;
  deleted: number;
};

// A row as stored in the cloud
export type Remote = {
  id: string;
  payload: string;
  updated_at: string;
  deleted: boolean;
};

const db = SQLite.openDatabaseSync("fobi.db");

db.execSync(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0
  );
`);

db.execSync(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

db.execSync(`
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Upgrade older versions (errors are ignored if a column already exists)
for (const sql of [
  "ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'text'",
  "ALTER TABLE messages ADD COLUMN file TEXT",
  "ALTER TABLE messages ADD COLUMN uid TEXT",
  "ALTER TABLE messages ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE messages ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE messages ADD COLUMN owner TEXT",
  "ALTER TABLE events ADD COLUMN uid TEXT",
  "ALTER TABLE events ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE events ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE events ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE events ADD COLUMN owner TEXT",
]) {
  try {
    db.execSync(sql);
  } catch {}
}

// Give every old row a permanent ID so it can be synced
function backfill(table: "messages" | "events") {
  const rows = db.getAllSync<{ id: number }>(
    `SELECT id FROM ${table} WHERE uid IS NULL`,
  );
  for (const r of rows) {
    db.runSync(
      `UPDATE ${table} SET uid = ? WHERE id = ?`,
      Crypto.randomUUID(),
      r.id,
    );
  }
  db.execSync(
    `UPDATE ${table} SET updated_at = created_at WHERE updated_at = 0`,
  );
}
backfill("messages");
backfill("events");

// ---------- Messages ----------

export function getMessages(): Message[] {
  return db.getAllSync<Message>(
    "SELECT * FROM messages WHERE deleted = 0 ORDER BY created_at DESC, id DESC",
  );
}

export function addMessage(text: string) {
  const now = Date.now();
  db.runSync(
    "INSERT INTO messages (uid, type, text, created_at, updated_at, dirty) VALUES (?, 'text', ?, ?, ?, 1)",
    Crypto.randomUUID(),
    text,
    now,
    now,
  );
}

export function addMedia(type: "photo" | "voice" | "drawing", file: string) {
  const now = Date.now();
  db.runSync(
    "INSERT INTO messages (uid, type, text, file, created_at, updated_at, dirty) VALUES (?, ?, '', ?, ?, ?, 1)",
    Crypto.randomUUID(),
    type,
    file,
    now,
    now,
  );
}

export function togglePin(id: number) {
  db.runSync(
    "UPDATE messages SET pinned = 1 - pinned, updated_at = ?, dirty = 1 WHERE id = ?",
    Date.now(),
    id,
  );
}

export function getPinned(): Message[] {
  return db.getAllSync<Message>(
    "SELECT * FROM messages WHERE pinned = 1 AND deleted = 0 ORDER BY created_at DESC",
  );
}

// Deleting marks the row as deleted so the deletion can sync too
export function deleteMessage(id: number) {
  db.runSync(
    "UPDATE messages SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?",
    Date.now(),
    id,
  );
}

// ---------- Calendar events ----------

export function getEvents(): Event[] {
  return db.getAllSync<Event>(
    "SELECT id, uid, title, date FROM events WHERE deleted = 0 ORDER BY date ASC, id ASC",
  );
}

export function addEvent(title: string, date: string) {
  const now = Date.now();
  db.runSync(
    "INSERT INTO events (uid, title, date, created_at, updated_at, dirty) VALUES (?, ?, ?, ?, ?, 1)",
    Crypto.randomUUID(),
    title,
    date,
    now,
    now,
  );
}

export function deleteEvent(id: number) {
  db.runSync(
    "UPDATE events SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?",
    Date.now(),
    id,
  );
}

// ---------- Sync helpers (used by sync.ts) ----------

export function getDirtyMessages(): DirtyMessage[] {
  return db.getAllSync<DirtyMessage>("SELECT * FROM messages WHERE dirty = 1");
}

export function getDirtyEvents(): DirtyEvent[] {
  return db.getAllSync<DirtyEvent>("SELECT * FROM events WHERE dirty = 1");
}

export function getMediaMessages(): { uid: string; file: string }[] {
  return db.getAllSync<{ uid: string; file: string }>(
    "SELECT uid, file FROM messages WHERE deleted = 0 AND file IS NOT NULL AND file != ''",
  );
}

// Only marks a row as uploaded if it hasn't changed since we sent it
export function markClean(
  table: "messages" | "events",
  uid: string,
  updatedAt: number,
) {
  db.runSync(
    `UPDATE ${table} SET dirty = 0 WHERE uid = ? AND updated_at = ?`,
    uid,
    updatedAt,
  );
}

export function applyRemoteMessage(r: Remote) {
  const remoteAt = Date.parse(r.updated_at);
  const local = db.getFirstSync<{ updated_at: number }>(
    "SELECT updated_at FROM messages WHERE uid = ?",
    r.id,
  );
  if (local && local.updated_at >= remoteAt) return; // ours is newer

  if (r.deleted) {
    if (local) {
      db.runSync(
        "UPDATE messages SET deleted = 1, updated_at = ?, dirty = 0 WHERE uid = ?",
        remoteAt,
        r.id,
      );
    }
    return;
  }

  const p = JSON.parse(r.payload);
  if (local) {
    db.runSync(
      "UPDATE messages SET type = ?, text = ?, file = ?, created_at = ?, pinned = ?, deleted = 0, updated_at = ?, dirty = 0 WHERE uid = ?",
      p.type,
      p.text ?? "",
      p.file ?? null,
      p.created_at,
      p.pinned ?? 0,
      remoteAt,
      r.id,
    );
  } else {
    db.runSync(
      "INSERT INTO messages (uid, type, text, file, created_at, pinned, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)",
      r.id,
      p.type,
      p.text ?? "",
      p.file ?? null,
      p.created_at,
      p.pinned ?? 0,
      remoteAt,
    );
  }
}

export function applyRemoteEvent(r: Remote) {
  const remoteAt = Date.parse(r.updated_at);
  const local = db.getFirstSync<{ updated_at: number }>(
    "SELECT updated_at FROM events WHERE uid = ?",
    r.id,
  );
  if (local && local.updated_at >= remoteAt) return;

  if (r.deleted) {
    if (local) {
      db.runSync(
        "UPDATE events SET deleted = 1, updated_at = ?, dirty = 0 WHERE uid = ?",
        remoteAt,
        r.id,
      );
    }
    return;
  }

  const p = JSON.parse(r.payload);
  if (local) {
    db.runSync(
      "UPDATE events SET title = ?, date = ?, created_at = ?, deleted = 0, updated_at = ?, dirty = 0 WHERE uid = ?",
      p.title,
      p.date,
      p.created_at,
      remoteAt,
      r.id,
    );
  } else {
    db.runSync(
      "INSERT INTO events (uid, title, date, created_at, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, ?, 0, 0)",
      r.id,
      p.title,
      p.date,
      p.created_at,
      remoteAt,
    );
  }
}

export function getState(key: string): string | null {
  return (
    db.getFirstSync<{ value: string }>(
      "SELECT value FROM sync_state WHERE key = ?",
      key,
    )?.value ?? null
  );
}

export function setState(key: string, value: string) {
  db.runSync(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
    key,
    value,
  );
}

// Removes everything stored on this phone (the cloud copy is untouched)
export function clearLocal() {
  db.execSync(
    "DELETE FROM messages; DELETE FROM events; DELETE FROM sync_state WHERE key NOT LIKE 'pref:%';"
  );
}

// Local data with no owner becomes this account's data. If a different
// account's data is on the phone, it is removed first. Returns true if
// it removed another account's data.
export function prepareForUser(userId: string): boolean {
  const foreign =
    db.getFirstSync(
      "SELECT 1 AS x FROM messages WHERE owner IS NOT NULL AND owner != ? LIMIT 1",
      userId,
    ) ||
    db.getFirstSync(
      "SELECT 1 AS x FROM events WHERE owner IS NOT NULL AND owner != ? LIMIT 1",
      userId,
    );
  if (foreign) clearLocal();
  db.runSync("UPDATE messages SET owner = ? WHERE owner IS NULL", userId);
  db.runSync("UPDATE events SET owner = ? WHERE owner IS NULL", userId);
  return !!foreign;
}

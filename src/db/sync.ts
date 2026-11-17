import {
  applyRemoteEvent,
  applyRemoteMessage,
  clearLocal,
  getDirtyEvents,
  getDirtyMessages,
  getMediaMessages,
  getState,
  markClean,
  prepareForUser,
  Remote,
  setState,
} from "./database";
import {
  clearMediaFolder,
  downloadMedia,
  mediaExists,
  readMedia,
} from "./media";
import { supabase } from "./supabase";

let running = false;
let startedAt = 0;
let report = "";
let uploadProblems = 0;

export function getSyncReport() {
  return report;
}

export function hasUploadProblems() {
  return uploadProblems > 0;
}

function contentTypeFor(file: string) {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}

function errorText(e: unknown) {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// ---------- Files (photos, drawings, voice notes) ----------

async function uploadMedia(
  userId: string,
  file: string,
): Promise<"uploaded" | "already" | "missing"> {
  if (getState(`up:${file}`)) return "already";
  if (!mediaExists(file)) return "missing";

  const bytes = readMedia(file);
  const { error } = await supabase.storage
    .from("media")
    .upload(`${userId}/${file}`, bytes.slice().buffer as ArrayBuffer, {
      contentType: contentTypeFor(file),
      upsert: true,
    });
  if (error) throw error;
  setState(`up:${file}`, "1");
  return "uploaded";
}

async function uploadAllMedia(userId: string) {
  const list = getMediaMessages();
  let uploaded = 0;
  let already = 0;
  let missing = 0;
  let failed = 0;
  let firstError = "";

  for (const m of list) {
    try {
      const result = await uploadMedia(userId, m.file);
      if (result === "uploaded") uploaded++;
      else if (result === "already") already++;
      else missing++;
    } catch (e) {
      failed++;
      if (!firstError) firstError = errorText(e);
      console.warn("Upload failed for", m.file, e);
    }
  }

  uploadProblems = failed;
  report =
    `Photos, drawings and voice notes in chat: ${list.length}\n` +
    `Uploaded just now: ${uploaded}\n` +
    `Already in cloud: ${already}\n` +
    `Not on this phone: ${missing}\n` +
    `Failed: ${failed}` +
    (firstError ? `\nFirst error: ${firstError}` : "");
}

async function downloadMissingMedia(userId: string) {
  for (const m of getMediaMessages()) {
    if (mediaExists(m.file)) continue;
    try {
      const { data, error } = await supabase.storage
        .from("media")
        .createSignedUrl(`${userId}/${m.file}`, 120);
      if (error || !data) continue; // maybe not uploaded yet
      await downloadMedia(data.signedUrl, m.file);
      setState(`up:${m.file}`, "1");
    } catch (e) {
      console.warn("Download failed for", m.file, e);
    }
  }
}

// Removes a file from the cloud (used when you delete a message)
export async function deleteCloudMedia(file: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return;
    await supabase.storage.from("media").remove([`${user.id}/${file}`]);
  } catch (e) {
    console.warn("Cloud delete failed:", e);
  }
}

// ---------- Messages and events ----------

// Downloads anything new from the cloud since the last time
async function pull(
  table: "messages" | "events",
  userId: string,
  apply: (r: Remote) => void,
) {
  const key = `lastPull:${userId}:${table}`;
  let since = Number(getState(key) ?? 0);

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("id,payload,updated_at,deleted")
      .gt("updated_at", new Date(since).toISOString())
      .order("updated_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data as Remote[]) {
      apply(r);
      since = Math.max(since, Date.parse(r.updated_at));
    }
    setState(key, String(since));
    if (data.length < 500) break;
  }
}

async function syncMessages(userId: string) {
  const dirty = getDirtyMessages();
  if (dirty.length > 0) {
    const rows = dirty.map((m) => ({
      id: m.uid,
      // Deleted messages upload nothing, so their content is erased
      payload: m.deleted
        ? "{}"
        : JSON.stringify({
            type: m.type,
            text: m.text,
            file: m.file,
            created_at: m.created_at,
            pinned: m.pinned,
          }),
      updated_at: new Date(m.updated_at).toISOString(),
      deleted: !!m.deleted,
    }));
    const { error } = await supabase
      .from("messages")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
    dirty.forEach((m) => markClean("messages", m.uid, m.updated_at));
  }
  await pull("messages", userId, applyRemoteMessage);
}

async function syncEvents(userId: string) {
  const dirty = getDirtyEvents();
  if (dirty.length > 0) {
    const rows = dirty.map((e) => ({
      id: e.uid,
      payload: e.deleted
        ? "{}"
        : JSON.stringify({
            title: e.title,
            date: e.date,
            created_at: e.created_at,
          }),
      updated_at: new Date(e.updated_at).toISOString(),
      deleted: !!e.deleted,
    }));
    const { error } = await supabase
      .from("events")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
    dirty.forEach((e) => markClean("events", e.uid, e.updated_at));
  }
  await pull("events", userId, applyRemoteEvent);
}

// Uploads local changes and downloads new ones. Returns true if it worked.
// Whenever it stops early, getSyncReport() says why.
export async function syncNow(): Promise<boolean> {
  // If a sync has been "running" for over a minute, treat it as stuck
  if (running && Date.now() - startedAt < 60000) {
    report =
      "Another sync is still running. Wait a few seconds and try again. If this keeps happening, fully close and reopen the app.";
    return false;
  }
  running = true;
  startedAt = Date.now();
  report = "";
  uploadProblems = 0;

  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      report = "Not signed in.";
      return false;
    }

    const wiped = prepareForUser(user.id);
    if (wiped) clearMediaFolder();

    await uploadAllMedia(user.id); // files first, so other phones can find them
    await syncMessages(user.id);
    await syncEvents(user.id);
    await downloadMissingMedia(user.id);
    return true;
  } catch (e) {
    report = `Sync stopped with an error:\n${errorText(e)}\n\n${report}`;
    console.warn("Sync failed:", e);
    return false;
  } finally {
    running = false;
  }
}

// Deletes the account, all cloud data and everything on this phone.
// Returns null on success, or a message describing what went wrong.
export async function deleteMyAccount(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return "Not signed in.";

  try {
    // 1. Remove all of this person's files from cloud storage
    for (let round = 0; round < 50; round++) {
      const { data: files, error } = await supabase.storage
        .from("media")
        .list(user.id, { limit: 100 });
      if (error) throw error;
      if (!files || files.length === 0) break;
      const { error: removeError } = await supabase.storage
        .from("media")
        .remove(files.map((f) => `${user.id}/${f.name}`));
      if (removeError) throw removeError;
    }

    // 2. Delete the login (which also deletes their messages and events)
    const { error } = await supabase.rpc("delete_my_account");
    if (error) throw error;
  } catch (e) {
    return errorText(e);
  }

  // 3. Wipe this phone and sign out
  clearLocal();
  clearMediaFolder();
  await supabase.auth.signOut({ scope: "local" });
  return null;
}

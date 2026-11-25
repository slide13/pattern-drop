import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../server/migrations.ts";
import { openStorage } from "../server/storage.ts";
import { handleSessionRequest } from "../server/sessions.ts";
import { removeExpiredSessions } from "../server/cleanup.ts";

const stale = "1111111111111111";
const fresh = "2222222222222222";
const png = (() => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, 10);
  new DataView(bytes.buffer).setUint32(20, 20);
  return bytes;
})();

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "patterndrop-expiry-"));
  const storage = openStorage(directory);
  t.after(() => {
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const call = (method, sessionId, body) =>
    handleSessionRequest(
      new Request(`http://localhost/api/sessions/${sessionId}`, {
        method,
        ...(body ? { headers: { "content-type": "image/png" }, body } : {}),
      }),
      storage,
    );
  const lastSeen = (sessionId) =>
    storage.db.prepare("SELECT last_seen_at FROM sessions WHERE id = ?").get(sessionId)
      ?.last_seen_at;
  const age = (sessionId, modifier) =>
    storage.db
      .prepare("UPDATE sessions SET last_seen_at = datetime('now', ?) WHERE id = ?")
      .run(modifier, sessionId);
  const folder = (sessionId) => join(directory, "images", "transfers", sessionId);
  return { storage, call, lastSeen, age, folder };
}

test("expired sessions lose their drawings and files; recent ones are kept", async (t) => {
  const f = fixture(t);
  for (const id of [stale, fresh]) {
    await f.call("POST", id);
    assert.equal((await f.call("PUT", id, png)).status, 200);
  }
  f.age(stale, "-8 days");
  f.age(fresh, "-6 days");
  assert.equal(await removeExpiredSessions(f.storage, 7), 1);

  assert.equal((await f.call("GET", stale)).status, 404);
  assert.equal(existsSync(f.folder(stale)), false);
  assert.equal(
    f.storage.db
      .prepare("SELECT COUNT(*) AS count FROM session_images WHERE session_id = ?")
      .get(stale).count,
    0,
  );
  assert.equal((await (await f.call("GET", fresh)).json()).drawings.length, 1);
  assert.equal(existsSync(f.folder(fresh)), true);
});

test("using a session keeps it alive, but polling writes at most hourly", async (t) => {
  const f = fixture(t);
  await f.call("POST", stale);
  f.age(stale, "-30 minutes");
  const recent = f.lastSeen(stale);
  await f.call("GET", stale);
  assert.equal(f.lastSeen(stale), recent, "a poll within the hour does not write");

  f.age(stale, "-8 days");
  await f.call("GET", stale);
  assert.equal(
    await removeExpiredSessions(f.storage, 7),
    0,
    "a poll after a long pause renews the session",
  );

  f.age(stale, "-8 days");
  await f.call("POST", stale);
  assert.equal(await removeExpiredSessions(f.storage, 7), 0, "re-registering renews the session");
});

test("upgrading dates existing sessions by their latest upload", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "patterndrop-expiry-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const legacy = new DatabaseSync(join(directory, "patterndrop.sqlite"));
  for (const migration of MIGRATIONS.slice(0, 5)) legacy.exec(migration);
  legacy.exec("PRAGMA user_version = 5");
  legacy
    .prepare("INSERT INTO sessions (id, created_at) VALUES (?, '2020-01-01 00:00:00')")
    .run(stale);
  legacy
    .prepare(
      "INSERT INTO session_images (id, session_id, object_key, width, height, created_at) VALUES (?, ?, ?, 10, 20, '2024-05-06 07:08:09')",
    )
    .run("aaaaaaaaaaaaaaaa", stale, `transfers/${stale}/aaaaaaaaaaaaaaaa.png`);
  legacy
    .prepare("INSERT INTO sessions (id, created_at) VALUES (?, '2023-03-04 05:06:07')")
    .run(fresh);
  legacy.close();
  const storage = openStorage(directory);
  try {
    const seen = (id) =>
      storage.db.prepare("SELECT last_seen_at FROM sessions WHERE id = ?").get(id).last_seen_at;
    assert.equal(seen(stale), "2024-05-06 07:08:09");
    assert.equal(seen(fresh), "2023-03-04 05:06:07");
  } finally {
    storage.close();
  }
});

test("cleanup rechecks activity after selecting its candidates", async (t) => {
  const f = fixture(t);
  await f.call("POST", fresh);
  await f.call("PUT", fresh, png);
  f.age(fresh, "-8 days");
  const candidates = f.storage.expiredSessions(7);
  await f.call("GET", fresh);
  assert.deepEqual(candidates, [fresh]);
  assert.equal(await f.storage.removeExpiredSession(candidates[0], 7), false);
  assert.equal(f.storage.imageCount(fresh), 1);
  assert.equal(existsSync(f.folder(fresh)), true);
});

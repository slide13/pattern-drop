import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStorage } from "../server/storage.ts";
import { handleSessionRequest } from "../server/sessions.ts";

const sessionId = "1111111111111111";
const otherSessionId = "2222222222222222";

function png(width = 10, height = 20) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

// Exercise real SQLite and files in an isolated temporary directory.
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "patterndrop-test-"));
  const storage = openStorage(directory);
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  const deletedKeys = [];
  const remove = storage.deleteImage;
  storage.deleteImage = async key => { await remove(key); deletedKeys.push(key); };
  const objects = { get size() {
    try { return readdirSync(join(directory, "images"), { recursive: true }).filter(name => name.endsWith(".png")).length; }
    catch (error) { if (error.code === "ENOENT") return 0; throw error; }
  } };
  const request = (method, session = sessionId, imageId) => handleSessionRequest(new Request(`http://localhost/api/sessions/${session}${imageId ? `/images/${imageId}` : ""}`, { method }), storage);
  const upload = async (session = sessionId) => {
    const response = await handleSessionRequest(new Request(`http://localhost/api/sessions/${session}`, {
      method: "PUT", headers: { "content-type": "image/png" }, body: png(),
    }), storage);
    assert.equal(response.status, 200);
    return (await response.json()).imageId;
  };
  return { sqlite: storage.db, storage, directory, objects, deletedKeys, request, upload };
}

test("deletes only the selected inventory item, its PNG and no other uploads", async t => {
  const f = fixture(t);
  const first = await f.upload(), second = await f.upload();
  const other = await f.upload(otherSessionId);
  assert.equal((await f.request("DELETE", sessionId, first)).status, 200);
  assert.deepEqual(f.deletedKeys, [`transfers/${sessionId}/${first}.png`]);
  const inventory = await (await f.request("GET")).json();
  assert.deepEqual(inventory.drawings.map(item => item.id), [second]);
  assert.equal((await f.request("GET", sessionId, first)).status, 404);
  assert.equal((await f.request("GET", sessionId, second)).status, 200);
  assert.equal((await f.request("GET", otherSessionId, other)).status, 200);
  assert.equal(f.objects.size, 2);
});

test("deleting the last item leaves an empty session and permits new uploads", async t => {
  const f = fixture(t);
  const item = await f.upload();
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
  assert.deepEqual((await (await f.request("GET")).json()).drawings, []);
  assert.equal(f.objects.size, 0);
  await f.upload();
  assert.equal((await (await f.request("GET")).json()).drawings.length, 1);
});

test("a different session cannot delete an image; repeated deletion is harmless", async t => {
  const f = fixture(t);
  const item = await f.upload();
  assert.equal((await f.request("DELETE", otherSessionId, item)).status, 404);
  assert.equal(f.deletedKeys.length, 0);
  assert.equal(f.objects.size, 1);
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
  assert.equal((await f.request("DELETE", sessionId, item)).status, 404);
  assert.equal(f.deletedKeys.length, 1);
});

test("storage failure reports an error and preserves the inventory for retry", async t => {
  const f = fixture(t);
  const item = await f.upload();
  const remove = f.storage.deleteImage;
  f.storage.deleteImage = async () => { throw new Error("Disk unavailable"); };
  assert.equal((await f.request("DELETE", sessionId, item)).status, 500);
  assert.equal((await (await f.request("GET")).json()).drawings.length, 1);
  assert.equal(f.objects.size, 1);
  f.storage.deleteImage = remove;
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
});

test("a failed database write after file deletion can be retried", async t => {
  const f = fixture(t);
  const item = await f.upload();
  const removeRow = f.storage.deleteImageRow;
  f.storage.deleteImageRow = () => { throw new Error("Database unavailable"); };
  assert.equal((await f.request("DELETE", sessionId, item)).status, 500);
  assert.equal((await (await f.request("GET")).json()).drawings.length, 1);
  assert.equal(f.objects.size, 1);
  f.storage.deleteImageRow = removeRow;
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
});

test("rejects oversized streams before storing anything", async t => {
  const f = fixture(t);
  const response = await handleSessionRequest(new Request(`http://localhost/api/sessions/${sessionId}`, {
    method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(12 * 1024 * 1024 + 1),
  }), f.storage);
  assert.equal(response.status, 413);
  assert.equal(f.objects.size, 0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM session_images").get().count, 0);
});

test("validates PNG bytes and reads dimensions from IHDR", async t => {
  const f = fixture(t);
  for (const [body, contentType, status] of [
    [new Uint8Array([137, 80, 78, 71]), "image/png", 400],
    [png(10001, 20), "image/png", 400],
    [png(10, 0), "image/png", 400],
    [png(), "image/jpeg", 415],
  ]) {
    const response = await handleSessionRequest(new Request(`http://localhost/api/sessions/${sessionId}`, {
      method: "PUT", headers: { "content-type": contentType }, body,
    }), f.storage);
    assert.equal(response.status, status);
  }
  assert.equal(f.objects.size, 0);
  const imageId = await f.upload();
  assert.deepEqual({ ...f.sqlite.prepare("SELECT width, height FROM session_images WHERE id = ?").get(imageId) }, { width: 10, height: 20 });
});

test("listing an unknown session is read-only", async t => {
  const f = fixture(t);
  assert.deepEqual(await (await f.request("GET")).json(), { drawings: [] });
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM session_images").get().count, 0);
  assert.equal((await f.request("POST")).status, 405);
});

test("sessions and PNG bytes survive closing and reopening SQLite", async t => {
  const f = fixture(t);
  const image = await f.upload();
  const reopened = openStorage(f.directory);
  try {
    const list = await handleSessionRequest(new Request(`http://localhost/api/sessions/${sessionId}`), reopened);
    assert.equal((await list.json()).drawings[0].id, image);
    const response = await handleSessionRequest(new Request(`http://localhost/api/sessions/${sessionId}/images/${image}`), reopened);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png());
  } finally { reopened.close(); }
});

test("a failed upload leaves no partial metadata or image file", async t => {
  const f = fixture(t);
  f.sqlite.exec("CREATE TRIGGER fail_image BEFORE INSERT ON session_images BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  const response = await handleSessionRequest(new Request(`http://localhost/api/sessions/${sessionId}`, {
    method: "PUT", headers: { "content-type": "image/png" }, body: png(),
  }), f.storage);
  assert.equal(response.status, 500);
  assert.equal(f.objects.size, 0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM session_images").get().count, 0);
});

test("rejects uploads once a session reaches its image limit, other sessions unaffected", async t => {
  const f = fixture(t);
  for (let i = 0; i < 200; i++) await f.upload();
  const response = await handleSessionRequest(new Request(`http://localhost/api/sessions/${sessionId}`, {
    method: "PUT", headers: { "content-type": "image/png" }, body: png(),
  }), f.storage);
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /200 drawings/);
  assert.equal(f.objects.size, 200);
  await f.upload(otherSessionId);
});

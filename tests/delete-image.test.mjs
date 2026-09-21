import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { default as worker } from "../dist/server/index.js";

const sessionId = "1111111111111111";
const otherSessionId = "2222222222222222";
const context = { waitUntil() {}, passThroughOnException() {} };

// Execute the actual API SQL against isolated SQLite; only the R2 boundary is
// simulated. Tests never touch the development database or user uploads.
function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const objects = new Map();
  const deletedKeys = [];
  const env = {
    DB: {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async run() { return statement.run(...values); },
          async first() { return statement.get(...values) || null; },
          async all() { return { results: statement.all(...values) }; },
        };
      },
      async batch(statements) {
        sqlite.exec("BEGIN");
        try {
          const result = [];
          for (const statement of statements) result.push(await statement.run());
          sqlite.exec("COMMIT");
          return result;
        } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      },
    },
    UPLOADS: {
      async put(key, body) { objects.set(key, await new Response(body).arrayBuffer()); },
      async get(key) { return objects.has(key) ? { body: objects.get(key), httpMetadata: { contentType: "image/png" } } : null; },
      async delete(key) { deletedKeys.push(key); objects.delete(key); },
    },
  };
  const request = (method, session = sessionId, imageId) => worker.fetch(new Request(`http://localhost/api/sessions/${session}${imageId ? `/images/${imageId}` : ""}`, { method }), env, context);
  const upload = async (session = sessionId) => {
    const response = await worker.fetch(new Request(`http://localhost/api/sessions/${session}`, {
      method: "PUT", headers: { "content-type": "image/png", "x-image-width": "10", "x-image-height": "20" }, body: new Uint8Array([137, 80, 78, 71]),
    }), env, context);
    assert.equal(response.status, 200);
    return (await response.json()).imageId;
  };
  return { sqlite, env, objects, deletedKeys, request, upload };
}

test("deletes only the selected inventory item, its PNG and no other uploads", async t => {
  const f = fixture(t);
  const first = await f.upload(), second = await f.upload();
  const other = await f.upload(otherSessionId);
  assert.equal((await f.request("DELETE", sessionId, first)).status, 200);
  assert.deepEqual(f.deletedKeys, [`transfers/${sessionId}/${first}.png`]);
  const inventory = await (await f.request("GET")).json();
  assert.deepEqual(inventory.drawings.map(item => item.id), [second]);
  assert.equal(inventory.status, "uploaded");
  assert.equal((await f.request("GET", sessionId, first)).status, 404);
  assert.equal((await f.request("GET", sessionId, second)).status, 200);
  assert.equal((await f.request("GET", otherSessionId, other)).status, 200);
  assert.equal(f.objects.size, 2);
  const row = f.sqlite.prepare("SELECT object_key, width, height FROM transfer_sessions WHERE id = ?").get(sessionId);
  assert.equal(row.object_key, `transfers/${sessionId}/${second}.png`);
});

test("deleting the last item resets the session and still permits new uploads", async t => {
  const f = fixture(t);
  const item = await f.upload();
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
  const inventory = await (await f.request("GET")).json();
  assert.equal(inventory.status, "waiting");
  assert.deepEqual(inventory.drawings, []);
  const row = f.sqlite.prepare("SELECT status, object_key, width, height FROM transfer_sessions WHERE id = ?").get(sessionId);
  assert.deepEqual({ ...row }, { status: "waiting", object_key: null, width: null, height: null });
  assert.equal(f.objects.size, 0);
  await f.upload();
  assert.equal((await (await f.request("GET")).json()).status, "uploaded");
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
  const remove = f.env.UPLOADS.delete;
  f.env.UPLOADS.delete = async () => { throw new Error("R2 unavailable"); };
  assert.equal((await f.request("DELETE", sessionId, item)).status, 500);
  assert.equal((await (await f.request("GET")).json()).drawings.length, 1);
  assert.equal(f.objects.size, 1);
  f.env.UPLOADS.delete = remove;
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
});

test("a failed database write after file deletion can be retried", async t => {
  const f = fixture(t);
  const item = await f.upload();
  const batch = f.env.DB.batch;
  f.env.DB.batch = async () => { throw new Error("D1 unavailable"); };
  assert.equal((await f.request("DELETE", sessionId, item)).status, 500);
  assert.equal((await (await f.request("GET")).json()).drawings.length, 1);
  f.env.DB.batch = batch;
  assert.equal((await f.request("DELETE", sessionId, item)).status, 200);
  assert.deepEqual((await (await f.request("GET")).json()).drawings, []);
});

test("rejects oversized streams without Content-Length before storing anything", async t => {
  const f = fixture(t);
  const response = await worker.fetch(new Request(`http://localhost/api/sessions/${sessionId}`, {
    method: "PUT", headers: { "content-type": "image/png" },
    body: new Uint8Array(12 * 1024 * 1024 + 1),
  }), f.env, context);
  assert.equal(response.status, 413);
  assert.equal(f.objects.size, 0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM session_images").get().count, 0);
});

test("rejects invalid dimensions and unsupported content before storing anything", async t => {
  const f = fixture(t);
  for (const [headers, status] of [
    [{ "content-type": "image/png", "x-image-width": "NaN" }, 400],
    [{ "content-type": "image/png", "x-image-height": "1.5" }, 400],
    [{ "content-type": "image/png", "x-image-width": "10001" }, 400],
    [{ "content-type": "image/jpeg" }, 415],
  ]) {
    const response = await worker.fetch(new Request(`http://localhost/api/sessions/${sessionId}`, {
      method: "PUT", headers, body: new Uint8Array([137, 80, 78, 71]),
    }), f.env, context);
    assert.equal(response.status, status);
  }
  assert.equal(f.objects.size, 0);
});

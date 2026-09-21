/** PatternDrop API and vinext entry point. No ChatGPT services are used. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

import type { Env, ExecutionContext } from "./types";
import { MAX_UPLOAD_BYTES, MAX_IMAGE_DIMENSION } from "../shared/constants";

const sessionPattern = /^\/api\/sessions\/([a-f0-9]{16})(?:\/images\/([a-f0-9]{16}))?$/;

async function ensureSchema(db: Env["DB"]) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS transfer_sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'waiting',
    object_key TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_transfer_sessions_updated_at ON transfer_sessions(updated_at)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS session_images (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    object_key TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_session_images_session_created ON session_images(session_id, created_at)").run();
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function handleSession(request: Request, env: Env, id: string, imageId?: string) {
  await ensureSchema(env.DB);
  if (imageId && request.method === "GET") {
    const row = await env.DB.prepare("SELECT object_key FROM session_images WHERE id = ? AND session_id = ?").bind(imageId, id).first<{ object_key: string }>();
    if (!row?.object_key) return new Response("Image not found", { status: 404 });
    const object = await env.UPLOADS.get(row.object_key);
    if (!object) return new Response("Image not found", { status: 404 });
    // Worker streams implement the Web Streams API; its generated types differ from lib.dom.
    return new Response(object.body as unknown as ReadableStream<Uint8Array>, { headers: {
      "content-type": object.httpMetadata?.contentType || "image/png",
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename="pattern-${imageId}.png"`,
    } });
  }
  if (imageId && request.method === "DELETE") {
    const row = await env.DB.prepare("SELECT object_key FROM session_images WHERE id = ? AND session_id = ?")
      .bind(imageId, id).first<{ object_key: string }>();
    if (!row) return json({ error: "Image not found" }, 404);
    // Delete storage first: a failed operation leaves metadata available for retry.
    try {
      await env.UPLOADS.delete(row.object_key);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM session_images WHERE id = ? AND session_id = ?").bind(imageId, id),
        env.DB.prepare(`UPDATE transfer_sessions SET
          status = CASE WHEN EXISTS (SELECT 1 FROM session_images WHERE session_id = ?) THEN 'uploaded' ELSE 'waiting' END,
          object_key = (SELECT object_key FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1),
          width = (SELECT width FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1),
          height = (SELECT height FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1),
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id, id, id, id, id),
      ]);
      return json({ ok: true });
    } catch {
      return json({ error: "Could not delete the image" }, 500);
    }
  }
  if (imageId) return new Response("Method not allowed", { status: 405 });

  if (request.method === "POST") {
    await env.DB.prepare("INSERT OR IGNORE INTO transfer_sessions (id) VALUES (?)").bind(id).run();
    return json({ ok: true }, 201);
  }
  if (request.method === "GET") {
    await env.DB.prepare("INSERT OR IGNORE INTO transfer_sessions (id) VALUES (?)").bind(id).run();
    const row = await env.DB.prepare("SELECT status, updated_at FROM transfer_sessions WHERE id = ?").bind(id).first<{
      status: "waiting" | "uploaded"; updated_at: string;
    }>();
    const drawings = await env.DB.prepare("SELECT id, width, height, created_at FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC").bind(id).all<{
      id: string; width: number; height: number; created_at: string;
    }>();
    return json({
      status: drawings.results.length ? "uploaded" : "waiting",
      updatedAt: row?.updated_at,
      drawings: drawings.results.map(item => ({ id: item.id, width: item.width, height: item.height, createdAt: item.created_at })),
    });
  }
  if (request.method === "PUT") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.split(";")[0].trim().toLowerCase() !== "image/png") return json({ error: "Expected a PNG image" }, 415);
    if (Number(request.headers.get("content-length") || 0) > MAX_UPLOAD_BYTES) return json({ error: "Image is too large" }, 413);
    const width = Number(request.headers.get("x-image-width") || 1);
    const height = Number(request.headers.get("x-image-height") || 1);
    if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_DIMENSION)) {
      return json({ error: "Invalid image dimensions" }, 400);
    }
    if (!request.body) return json({ error: "Expected an image body" }, 400);
    // Content-Length may be missing or false. Enforce the limit while reading.
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_UPLOAD_BYTES) {
          await reader.cancel();
          return json({ error: "Image is too large" }, 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) return json({ error: "Expected an image body" }, 400);
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const uploadedImageId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const objectKey = `transfers/${id}/${uploadedImageId}.png`;
    await env.UPLOADS.put(objectKey, body, { httpMetadata: { contentType: "image/png" } });
    await env.DB.prepare(`INSERT INTO transfer_sessions (id, status, object_key, width, height, updated_at)
      VALUES (?, 'uploaded', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET status='uploaded', object_key=excluded.object_key,
      width=excluded.width, height=excluded.height, updated_at=CURRENT_TIMESTAMP`)
      .bind(id, objectKey, width, height).run();
    await env.DB.prepare("INSERT INTO session_images (id, session_id, object_key, width, height) VALUES (?, ?, ?, ?, ?)")
      .bind(uploadedImageId, id, objectKey, width, height).run();
    return json({ ok: true, imageId: uploadedImageId });
  }
  return new Response("Method not allowed", { status: 405 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(sessionPattern);
    if (match) return handleSession(request, env, match[1], match[2]);
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: path => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }
    return handler.fetch(request, env, ctx);
  },
};
export default worker;

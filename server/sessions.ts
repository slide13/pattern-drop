import { MAX_UPLOAD_BYTES, MAX_IMAGE_DIMENSION } from "../shared/constants.ts";
import { getStorage, type Storage } from "./storage.ts";
import type { ImageRow, SessionRow } from "./types";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function handleSession(request: Request, storage: Storage, id: string, imageId?: string) {
  const db = storage.db;
  if (imageId && request.method === "GET") {
    const row = storage.image(id, imageId);
    if (!row) return new Response("Image not found", { status: 404 });
    const body = await storage.readImage(row.object_key);
    if (!body) return new Response("Image not found", { status: 404 });
    return new Response(body, { headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename="pattern-${imageId}.png"`,
    } });
  }
  if (imageId && request.method === "DELETE") {
    const row = storage.image(id, imageId);
    if (!row) return json({ error: "Image not found" }, 404);
    const body = await storage.readImage(row.object_key);
    if (!body) return json({ error: "Image not found" }, 404);
    await storage.deleteImage(row.object_key);
    try {
      storage.transaction(() => {
        db.prepare("DELETE FROM session_images WHERE id = ? AND session_id = ?").run(imageId, id);
        db.prepare(`UPDATE transfer_sessions SET
          status = CASE WHEN EXISTS (SELECT 1 FROM session_images WHERE session_id = ?) THEN 'uploaded' ELSE 'waiting' END,
          object_key = (SELECT object_key FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1),
          width = (SELECT width FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1),
          height = (SELECT height FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1),
          updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id, id, id, id, id);
      });
    } catch (error) {
      await storage.writeImage(row.object_key, body);
      throw error;
    }
    return json({ ok: true });
  }
  if (imageId) return new Response("Method not allowed", { status: 405 });

  if (request.method === "POST") {
    db.prepare("INSERT OR IGNORE INTO transfer_sessions (id) VALUES (?)").run(id);
    return json({ ok: true }, 201);
  }
  if (request.method === "GET") {
    db.prepare("INSERT OR IGNORE INTO transfer_sessions (id) VALUES (?)").run(id);
    const row = db.prepare("SELECT updated_at FROM transfer_sessions WHERE id = ?").get(id) as SessionRow;
    const drawings = db.prepare("SELECT * FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC").all(id) as ImageRow[];
    return json({
      status: drawings.length ? "uploaded" : "waiting",
      updatedAt: row?.updated_at,
      drawings: drawings.map(item => ({ id: item.id, width: item.width, height: item.height, createdAt: item.created_at })),
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
    await storage.writeImage(objectKey, body);
    try {
      storage.transaction(() => {
        db.prepare(`INSERT INTO transfer_sessions (id, status, object_key, width, height, updated_at)
          VALUES (?, 'uploaded', ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET status='uploaded', object_key=excluded.object_key,
          width=excluded.width, height=excluded.height, updated_at=CURRENT_TIMESTAMP`).run(id, objectKey, width, height);
        db.prepare("INSERT INTO session_images (id, session_id, object_key, width, height) VALUES (?, ?, ?, ?, ?)")
          .run(uploadedImageId, id, objectKey, width, height);
      });
    } catch (error) {
      await storage.deleteImage(objectKey);
      throw error;
    }
    return json({ ok: true, imageId: uploadedImageId });
  }
  return new Response("Method not allowed", { status: 405 });
}

export async function handleSessionRequest(request: Request, storage?: Storage): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/api\/sessions\/([a-f0-9]{16})(?:\/images\/([a-f0-9]{16}))?$/);
  if (!match) return json({ error: "Not found" }, 404);
  try { return await handleSession(request, storage ?? getStorage(), match[1], match[2]); }
  catch (error) {
    console.error("Session request failed:", error);
    return json({ error: "Could not complete the request" }, 500);
  }
}

/** PatternDrop API and vinext entry point. No ChatGPT services are used. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  UPLOADS: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }

const sessionPattern = /^\/api\/sessions\/([a-f0-9]{16})(?:\/images\/([a-f0-9]{16}))?$/;

async function ensureSchema(db: D1Database) {
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
    return new Response(object.body, { headers: {
      "content-type": object.httpMetadata?.contentType || "image/png",
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename="pattern-${imageId}.png"`,
    } });
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
    if (!contentType.startsWith("image/")) return json({ error: "Expected an image" }, 415);
    if (Number(request.headers.get("content-length") || 0) > 12 * 1024 * 1024) return json({ error: "Image is too large" }, 413);
    const uploadedImageId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const objectKey = `transfers/${id}/${uploadedImageId}.png`;
    await env.UPLOADS.put(objectKey, request.body, { httpMetadata: { contentType: "image/png" } });
    const width = Math.max(1, Math.min(10000, Number(request.headers.get("x-image-width") || 1)));
    const height = Math.max(1, Math.min(10000, Number(request.headers.get("x-image-height") || 1)));
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

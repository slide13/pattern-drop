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

const sessionPattern = /^\/api\/sessions\/([a-f0-9]{16})(\/image)?$/;

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
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function handleSession(request: Request, env: Env, id: string, wantsImage: boolean) {
  await ensureSchema(env.DB);
  if (wantsImage && request.method === "GET") {
    const row = await env.DB.prepare("SELECT object_key FROM transfer_sessions WHERE id = ?").bind(id).first<{ object_key: string | null }>();
    if (!row?.object_key) return new Response("Image not found", { status: 404 });
    const object = await env.UPLOADS.get(row.object_key);
    if (!object) return new Response("Image not found", { status: 404 });
    return new Response(object.body, { headers: {
      "content-type": object.httpMetadata?.contentType || "image/png",
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename="pattern-${id}.png"`,
    } });
  }
  if (wantsImage) return new Response("Method not allowed", { status: 405 });

  if (request.method === "POST") {
    await env.DB.prepare("INSERT OR IGNORE INTO transfer_sessions (id) VALUES (?)").bind(id).run();
    return json({ ok: true }, 201);
  }
  if (request.method === "GET") {
    await env.DB.prepare("INSERT OR IGNORE INTO transfer_sessions (id) VALUES (?)").bind(id).run();
    const row = await env.DB.prepare("SELECT status, width, height, updated_at FROM transfer_sessions WHERE id = ?").bind(id).first<{
      status: "waiting" | "uploaded"; width: number | null; height: number | null; updated_at: string;
    }>();
    return json({ status: row?.status || "waiting", width: row?.width, height: row?.height, updatedAt: row?.updated_at });
  }
  if (request.method === "PUT") {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return json({ error: "Expected an image" }, 415);
    if (Number(request.headers.get("content-length") || 0) > 12 * 1024 * 1024) return json({ error: "Image is too large" }, 413);
    const objectKey = `transfers/${id}.png`;
    await env.UPLOADS.put(objectKey, request.body, { httpMetadata: { contentType: "image/png" } });
    const width = Math.max(1, Math.min(10000, Number(request.headers.get("x-image-width") || 1)));
    const height = Math.max(1, Math.min(10000, Number(request.headers.get("x-image-height") || 1)));
    await env.DB.prepare(`INSERT INTO transfer_sessions (id, status, object_key, width, height, updated_at)
      VALUES (?, 'uploaded', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET status='uploaded', object_key=excluded.object_key,
      width=excluded.width, height=excluded.height, updated_at=CURRENT_TIMESTAMP`)
      .bind(id, objectKey, width, height).run();
    return json({ ok: true });
  }
  return new Response("Method not allowed", { status: 405 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(sessionPattern);
    if (match) return handleSession(request, env, match[1], Boolean(match[2]));
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

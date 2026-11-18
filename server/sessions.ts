import { readPngUpload, UploadError } from "./png-upload.ts";
import { getStorage, type Storage } from "./storage.ts";
import { MAX_IMAGES_PER_SESSION } from "../shared/constants.ts";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function getImage(storage: Storage, sessionId: string, imageId: string) {
  const row = storage.image(sessionId, imageId);
  if (!row) return new Response("Image not found", { status: 404 });
  const body = await storage.readImage(row.object_key);
  if (!body) return new Response("Image not found", { status: 404 });
  return new Response(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
      "content-disposition": `inline; filename="pattern-${imageId}.png"`,
    },
  });
}

async function deleteImage(storage: Storage, sessionId: string, imageId: string) {
  const row = storage.image(sessionId, imageId);
  if (!row) return json({ error: "Image not found" }, 404);
  const body = await storage.readImage(row.object_key);
  if (!body) return json({ error: "Image not found" }, 404);

  await storage.deleteImage(row.object_key);
  try {
    storage.deleteImageRow(sessionId, imageId);
  } catch (error) {
    await storage.writeImage(row.object_key, body);
    throw error;
  }
  return json({ ok: true });
}

async function uploadImage(request: Request, storage: Storage, sessionId: string) {
  // Checked before reading the body so a full session cannot be used to fill the disk.
  if (storage.imageCount(sessionId) >= MAX_IMAGES_PER_SESSION) {
    return json({ error: `This session already has ${MAX_IMAGES_PER_SESSION} drawings. Start a new session.` }, 429);
  }
  const { body, width, height } = await readPngUpload(request);
  const imageId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const objectKey = `transfers/${sessionId}/${imageId}.png`;
  await storage.writeImage(objectKey, body);
  try {
    storage.insertImage({ id: imageId, session_id: sessionId, object_key: objectKey, width, height });
  } catch (error) {
    await storage.deleteImage(objectKey);
    throw error;
  }
  return json({ ok: true, imageId });
}

async function handleSession(request: Request, storage: Storage, sessionId: string, imageId?: string) {
  if (imageId) {
    if (request.method === "GET") return getImage(storage, sessionId, imageId);
    if (request.method === "DELETE") return deleteImage(storage, sessionId, imageId);
    return new Response("Method not allowed", { status: 405 });
  }

  if (request.method === "GET") {
    const drawings = storage.images(sessionId).map(({ id, width, height }) => ({ id, width, height }));
    return json({ drawings });
  }
  if (request.method === "PUT") return uploadImage(request, storage, sessionId);
  return new Response("Method not allowed", { status: 405 });
}

export async function handleSessionRequest(request: Request, storage?: Storage): Promise<Response> {
  const match = new URL(request.url).pathname.match(/^\/api\/sessions\/([a-f0-9]{16})(?:\/images\/([a-f0-9]{16}))?$/);
  if (!match) return json({ error: "Not found" }, 404);
  try {
    return await handleSession(request, storage ?? getStorage(), match[1], match[2]);
  } catch (error) {
    if (error instanceof UploadError) return json({ error: error.message }, error.status);
    console.error("Session request failed:", error);
    return json({ error: "Could not complete the request" }, 500);
  }
}

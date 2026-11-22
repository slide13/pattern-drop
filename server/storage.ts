import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { MIGRATIONS } from "./migrations.ts";
import type { ImageRow } from "./types";

export function openStorage(directory: string) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(resolve(root, "patterndrop.sqlite"));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [index, migration] of MIGRATIONS.entries()) {
        if (index < version) continue;
        db.exec(migration);
        db.exec(`PRAGMA user_version = ${index + 1}`);
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } catch (error) { db.close(); throw error; }

  function imagePath(key: string) {
    if (!/^transfers\/[a-f0-9]{16}\/[a-f0-9]{16}\.png$/.test(key)) throw new Error("Invalid image key");
    return resolve(root, "images", key);
  }

  return {
    db,
    close: () => db.close(),
    sessionExists(sessionId: string) {
      return !!db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(sessionId);
    },
    createSession(sessionId: string) {
      db.prepare("INSERT OR IGNORE INTO sessions (id) VALUES (?)").run(sessionId);
    },
    image(sessionId: string, imageId: string) {
      return db.prepare("SELECT * FROM session_images WHERE id = ? AND session_id = ?").get(imageId, sessionId) as ImageRow | undefined;
    },
    images(sessionId: string) {
      return db.prepare("SELECT * FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC").all(sessionId) as ImageRow[];
    },
    imageCount(sessionId: string) {
      return (db.prepare("SELECT COUNT(*) AS count FROM session_images WHERE session_id = ?").get(sessionId) as { count: number }).count;
    },
    /** Inserts the image unless the session already holds `limit` images; returns whether it did. */
    insertImage(image: Omit<ImageRow, "created_at">, limit = Infinity) {
      // Count and insert in one write transaction so concurrent uploads cannot both pass the check.
      db.exec("BEGIN IMMEDIATE");
      try {
        const { count } = db.prepare("SELECT COUNT(*) AS count FROM session_images WHERE session_id = ?")
          .get(image.session_id) as { count: number };
        if (count >= limit) { db.exec("ROLLBACK"); return false; }
        db.prepare("INSERT INTO session_images (id, session_id, object_key, width, height) VALUES (?, ?, ?, ?, ?)")
          .run(image.id, image.session_id, image.object_key, image.width, image.height);
        db.exec("COMMIT");
        return true;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    deleteImageRow(sessionId: string, imageId: string) {
      db.prepare("DELETE FROM session_images WHERE id = ? AND session_id = ?").run(imageId, sessionId);
    },
    async readImage(key: string) {
      try { return new Uint8Array(await readFile(imagePath(key))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async writeImage(key: string, body: Uint8Array) {
      const path = imagePath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body, { flag: "wx" });
    },
    async deleteImage(key: string) {
      try { await unlink(imagePath(key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    },
  };
}

export type Storage = ReturnType<typeof openStorage>;
const local = globalThis as typeof globalThis & { patternDropStorage?: Storage };
export function getStorage() {
  return local.patternDropStorage ??= openStorage(process.env.PATTERNDROP_DATA_DIR || ".data");
}

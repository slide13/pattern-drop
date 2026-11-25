import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { MIGRATIONS } from "./migrations.ts";
import { startSessionCleanup } from "./cleanup.ts";
import type { ImageRow } from "./types";

export function openStorage(directory: string) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(resolve(root, "patterndrop.sqlite"));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [index, migration] of MIGRATIONS.entries()) {
        if (index < version) continue;
        db.exec(migration);
        db.exec(`PRAGMA user_version = ${index + 1}`);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    db.close();
    throw error;
  }

  function sessionDirectory(sessionId: string) {
    if (!/^[a-f0-9]{16}$/.test(sessionId)) throw new Error("Invalid session id");
    return resolve(root, "images", "transfers", sessionId);
  }

  function imagePath(key: string) {
    if (!/^transfers\/[a-f0-9]{16}\/[a-f0-9]{16}\.png$/.test(key))
      throw new Error("Invalid image key");
    return resolve(root, "images", key);
  }

  function uploadedImageId(sessionId: string, key: string | null) {
    if (key === null) return undefined;
    const row = db
      .prepare("SELECT id FROM session_images WHERE session_id = ? AND upload_key = ?")
      .get(sessionId, key) as { id: string } | undefined;
    return row?.id;
  }

  return {
    db,
    uploadedImageId,
    close: () => db.close(),
    sessionExists(sessionId: string) {
      return !!db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(sessionId);
    },
    /** Creates the session, or marks an existing one as just used. */
    createSession(sessionId: string) {
      db.prepare(
        `INSERT INTO sessions (id, last_seen_at) VALUES (?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP`,
      ).run(sessionId);
    },
    /** Marks a session as used. Coarse (hourly) so frequent polling does not write every time. */
    touchSession(sessionId: string) {
      db.prepare(
        `UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < datetime('now', '-1 hour'))`,
      ).run(sessionId);
    },
    /** Sessions not used for `days` days. */
    expiredSessions(days: number) {
      const rows = db
        .prepare("SELECT id FROM sessions WHERE last_seen_at < datetime('now', ?)")
        .all(`-${days} days`) as { id: string }[];
      return rows.map((row) => row.id);
    },
    /** Deletes a session, its image rows and every file stored for it. */
    async removeExpiredSession(sessionId: string, days: number) {
      const directory = sessionDirectory(sessionId);
      let images: { object_key: string }[];
      db.exec("BEGIN IMMEDIATE");
      try {
        const deleted = db
          .prepare("DELETE FROM sessions WHERE id = ? AND last_seen_at < datetime('now', ?)")
          .run(sessionId, `-${days} days`);
        if (!deleted.changes) {
          db.exec("COMMIT");
          return false;
        }
        images = db
          .prepare("SELECT object_key FROM session_images WHERE session_id = ?")
          .all(sessionId) as typeof images;
        db.prepare("DELETE FROM session_images WHERE session_id = ?").run(sessionId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      // A desktop can register the same ID again while files are being removed.
      for (const image of images) await rm(imagePath(image.object_key), { force: true });
      try {
        await rmdir(directory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
      }
      return true;
    },
    image(sessionId: string, imageId: string) {
      return db
        .prepare("SELECT * FROM session_images WHERE id = ? AND session_id = ?")
        .get(imageId, sessionId) as ImageRow | undefined;
    },
    images(sessionId: string) {
      return db
        .prepare(
          "SELECT * FROM session_images WHERE session_id = ? ORDER BY created_at DESC, id DESC",
        )
        .all(sessionId) as ImageRow[];
    },
    imageCount(sessionId: string) {
      return (
        db
          .prepare("SELECT COUNT(*) AS count FROM session_images WHERE session_id = ?")
          .get(sessionId) as { count: number }
      ).count;
    },
    /** Inserts the image unless the session already holds `limit` images; returns the original ID on replay. */
    insertImage(image: Omit<ImageRow, "created_at">, limit: number, uploadKey: string | null) {
      // Count and insert in one write transaction so concurrent uploads cannot both pass the check.
      db.exec("BEGIN IMMEDIATE");
      try {
        const previous = uploadedImageId(image.session_id, uploadKey);
        if (previous) {
          db.exec("COMMIT");
          return previous;
        }
        const { count } = db
          .prepare("SELECT COUNT(*) AS count FROM session_images WHERE session_id = ?")
          .get(image.session_id) as { count: number };
        if (count >= limit) {
          db.exec("ROLLBACK");
          return null;
        }
        db.prepare(
          "INSERT INTO session_images (id, session_id, object_key, width, height, upload_key) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(image.id, image.session_id, image.object_key, image.width, image.height, uploadKey);
        db.exec("COMMIT");
        return image.id;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    deleteImageRow(sessionId: string, imageId: string) {
      db.prepare("DELETE FROM session_images WHERE id = ? AND session_id = ?").run(
        imageId,
        sessionId,
      );
    },
    async readImage(key: string) {
      try {
        return new Uint8Array(await readFile(imagePath(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async writeImage(key: string, body: Uint8Array) {
      const path = imagePath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body, { flag: "wx" });
    },
    async deleteImage(key: string) {
      try {
        await unlink(imagePath(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

export type Storage = ReturnType<typeof openStorage>;
const local = globalThis as typeof globalThis & { patternDropStorage?: Storage };
export function getStorage() {
  if (!local.patternDropStorage) {
    local.patternDropStorage = openStorage(process.env.PATTERNDROP_DATA_DIR || ".data");
    startSessionCleanup(local.patternDropStorage);
  }
  return local.patternDropStorage;
}

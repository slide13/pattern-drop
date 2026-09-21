import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
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
export interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }


import assert from "node:assert/strict";
import test from "node:test";

test("server-renders the PatternDrop product shell", async () => {
  const serverUrl = new URL("../../dist/server/index.js", import.meta.url);
  serverUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handleRequest } = await import(serverUrl.href);
  const response = await handleRequest(new Request("http://localhost/"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>PatternDrop/);
  assert.match(html, /PatternDrop/);
  assert.match(html, /<html\b[^>]*\blang="en"/);
  assert.match(html, /From paper to screen/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|ChatGPT/i);
});

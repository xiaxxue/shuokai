import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 说开 prototype", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /说开 SHUOKAI/);
  assert.match(html, /理解，不必同意/);
  assert.match(html, /我想说开一件事/);
  assert.match(html, /READY/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps product privacy and state-machine concepts explicit", async () => {
  const [prototype, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/SayOpenPrototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(prototype, /私人内容默认不共享/);
  assert.match(prototype, /PERSPECTIVE_APPROVED/);
  assert.match(prototype, /REVIEWING_COMMON_VIEW/);
  assert.match(prototype, /AGREEMENT_ACTIVATED/);
  assert.match(layout, /说开 SHUOKAI/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the 说开 product UI instead of starter content", async () => {
  const [prototype, layout] = await Promise.all([
    readFile(new URL("../app/SayOpenPrototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /说开 SHUOKAI/);
  assert.match(prototype, /理解，不必同意/);
  assert.match(prototype, /我想说开一件事/);
  assert.match(prototype, /ROOM_READY/);
  assert.doesNotMatch(prototype, /Your site is taking shape|Building your site/);
});

test("keeps product privacy and state-machine concepts explicit", async () => {
  const [prototype, layout, packageJson, api, schema, hosting] = await Promise.all([
    readFile(new URL("../app/SayOpenPrototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(prototype, /私人内容默认不共享/);
  assert.match(prototype, /PERSPECTIVE_APPROVED/);
  assert.match(prototype, /REVIEWING_COMMON_VIEW/);
  assert.match(prototype, /AGREEMENT_ACTIVATED/);
  assert.match(layout, /说开 SHUOKAI/);
  assert.match(api, /rawDraftVisibility: "owner_only"/);
  assert.match(api, /sharedContentRule: "approved_perspectives_only"/);
  assert.match(api, /hashToken/);
  assert.match(schema, /roomEvents/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

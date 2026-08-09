import test from "node:test";
import assert from "node:assert/strict";
import { validateTestDeploySource } from "../scripts/deploy-test-from-main.mjs";

const cleanMain = {
  branch: "main",
  head: "abc123",
  originMain: "abc123",
  originUrl: "https://github.com/xiaxxue/shuokai.git",
  status: "",
};

test("allows a clean main checkout that exactly matches GitHub", () => {
  assert.doesNotThrow(() => validateTestDeploySource(cleanMain));
});

test("rejects deployment from a feature branch", () => {
  assert.throws(
    () => validateTestDeploySource({ ...cleanMain, branch: "codex/example" }),
    /只能从 main 部署/,
  );
});

test("rejects a local main commit that is not on GitHub", () => {
  assert.throws(
    () => validateTestDeploySource({ ...cleanMain, head: "local-only" }),
    /必须先推送并确认 GitHub main/,
  );
});

test("rejects a checkout whose origin is not the canonical GitHub repository", () => {
  assert.throws(
    () => validateTestDeploySource({ ...cleanMain, originUrl: "https://example.com/shuokai.git" }),
    /拒绝部署未知来源/,
  );
});

test("rejects a dirty checkout", () => {
  assert.throws(
    () => validateTestDeploySource({ ...cleanMain, status: " M miniapp/src/app.vue" }),
    /工作区不干净/,
  );
});

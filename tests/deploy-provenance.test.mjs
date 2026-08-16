import test from "node:test";
import assert from "node:assert/strict";
import { validateTestDeploySource } from "../scripts/deploy-test-from-main.mjs";
import {
  validateProductionSiteBuild,
  validateProductionSiteDeploySource,
} from "../scripts/deploy-site-production-from-main.mjs";
import {
  validateProductionBuildConfiguration,
  validateProductionDeploySource,
  validateProductionSecrets,
  validateProductionWorkerConfig,
} from "../scripts/deploy-production-from-main.mjs";

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

const approvedProductionMain = {
  ...cleanMain,
  approval: "shuokai.me",
  appApproval: "app.shuokai.me",
};

test("allows an explicitly approved production site deploy from clean GitHub main", () => {
  assert.doesNotThrow(() => validateProductionSiteDeploySource(approvedProductionMain));
});

test("rejects a production site deploy without explicit hostname approval", () => {
  assert.throws(
    () => validateProductionSiteDeploySource({ ...approvedProductionMain, approval: "" }),
    /需要显式设置/,
  );
});

test("rejects the linked production site until the H5 release is approved", () => {
  assert.throws(
    () => validateProductionSiteDeploySource({ ...approvedProductionMain, appApproval: "" }),
    /需要先确认/,
  );
});

test("rejects a production site deploy from a feature branch", () => {
  assert.throws(
    () => validateProductionSiteDeploySource({ ...approvedProductionMain, branch: "codex/example" }),
    /只能从 main 部署/,
  );
});

test("accepts only the official site Worker build output", () => {
  assert.doesNotThrow(() => validateProductionSiteBuild(JSON.stringify({
    name: "shuokai-official-site",
    main: "index.js",
    assets: { directory: "../client" },
  })));
  assert.throws(
    () => validateProductionSiteBuild(JSON.stringify({
      name: "shuokai-ai",
      main: "index.js",
      assets: { directory: "../client" },
    })),
    /拒绝覆盖其他 Worker/,
  );
});

const approvedProductionAppMain = {
  ...cleanMain,
  approval: "app.shuokai.me",
};

test("allows an explicitly approved production H5 deploy from clean GitHub main", () => {
  assert.doesNotThrow(() => validateProductionDeploySource(approvedProductionAppMain));
  assert.throws(
    () => validateProductionDeploySource({ ...approvedProductionAppMain, approval: "shuokai.me" }),
    /需要显式设置/,
  );
  assert.throws(
    () => validateProductionDeploySource({ ...approvedProductionAppMain, branch: "codex/example" }),
    /只能从 main 部署/,
  );
});

test("requires a matching production Supabase project and publishable client key", () => {
  assert.doesNotThrow(() => validateProductionBuildConfiguration({
    supabaseUrl: "https://production-ref.supabase.co",
    supabasePublishableKey: "sb_publishable_production",
    productionProjectRef: "production-ref",
  }));
  assert.throws(
    () => validateProductionBuildConfiguration({
      supabaseUrl: "https://test-ref.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
      productionProjectRef: "production-ref",
    }),
    /必须与生产 Supabase URL 完全匹配/,
  );
  assert.throws(
    () => validateProductionBuildConfiguration({
      supabaseUrl: "https://production-ref.supabase.co",
      supabasePublishableKey: "sb_secret_never_in_a_client",
      productionProjectRef: "production-ref",
    }),
    /不能使用 secret\/service-role key/,
  );
});

test("pins the production Worker, custom domain, queues, and required secrets", () => {
  const config = JSON.stringify({
    name: "shuokai-ai",
    vars: { APP_ENVIRONMENT: "production" },
    routes: [{ pattern: "app.shuokai.me", custom_domain: true }],
    queues: {
      producers: [{ binding: "AI_JOBS_QUEUE", queue: "shuokai-ai-jobs-production" }],
      consumers: [{
        queue: "shuokai-ai-jobs-production",
        dead_letter_queue: "shuokai-ai-jobs-production-dlq",
      }],
    },
  });
  assert.doesNotThrow(() => validateProductionWorkerConfig(config));
  assert.doesNotThrow(() => validateProductionSecrets(JSON.stringify([
    { name: "SUPABASE_SECRET_KEY" },
  ])));
  assert.throws(
    () => validateProductionSecrets(JSON.stringify([{ name: "SUPABASE_URL" }])),
    /SUPABASE_SECRET_KEY/,
  );
  assert.throws(
    () => validateProductionSecrets(JSON.stringify([
      { name: "SUPABASE_SECRET_KEY" },
      { name: "SUPABASE_URL" },
    ])),
    /会遮蔽本次生产配置的旧 Secrets/,
  );
});

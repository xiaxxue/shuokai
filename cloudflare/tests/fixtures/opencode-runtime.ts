import { requestOpenCodeOutput } from "../../src/opencode-ai.ts";

export default {
  async fetch(request: Request) {
    const status = Number(new URL(request.url).searchParams.get("status") ?? 200);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let redirect = "";
    // No network or real credential is used. The native Workers Request
    // constructor still validates the exact options sent by the adapter.
    globalThis.fetch = async (url, init) => {
      calls++;
      const upstream = new Request(url, init);
      redirect = upstream.redirect;
      await upstream.body?.cancel();
      return status === 200
        ? Response.json({ choices: [{ message: { content: '{"ok":true}' } }] })
        : new Response(null, { status, headers: { location: "https://must-not-follow.invalid" } });
    };
    try {
      await requestOpenCodeOutput({ OPENCODE_API_KEY: "synthetic-runtime-test" }, {
        messages: [{ role: "user", content: "synthetic input" }],
        schemaName: "runtime_test",
        schema: { type: "object", properties: { ok: { type: "boolean" } } },
        maxTokens: 32,
      });
      return Response.json({ ok: true, calls, redirect });
    } catch (error) {
      return Response.json({ ok: false, code: error instanceof Error ? error.message : "UNKNOWN", calls, redirect });
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
};

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const prototypes = [
  ["direction-a", new URL("./direction-a/index.html", import.meta.url)],
  ["direction-b", new URL("./direction-b/index.html", import.meta.url)],
];
const conversationDemo = new URL("./conversation-demo.html", import.meta.url);

const requiredConcepts = [
  "仅自己可见",
  "尚未共享",
  "批准",
  "稍后",
  "拒绝",
  "共同",
  "未核实",
  "7 天",
  "转写",
  "AI",
  "对话",
  "复述",
  "继续讲",
  "跳过",
  "讲得差不多了",
  "一次只",
  "网络",
  "邀请",
  "暂停",
];

function browserStubs() {
  const elements = new Map();
  const createElement = () => ({
    innerHTML: "",
    textContent: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    focus() {},
  });
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };
  return {
    elements,
    document: {
      body: { style: {} },
      activeElement: null,
      addEventListener() {},
      getElementById,
    },
    location: { search: "", pathname: "/", origin: "file://" },
    history: { replaceState() {} },
    window: { scrollTo() {} },
    matchMedia: () => ({ matches: true }),
    URLSearchParams,
  };
}

for (const [name, file] of prototypes) {
  const html = await readFile(file, "utf8");
  assert.match(html, /<meta name="viewport"/i, `${name}: missing viewport metadata`);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(?:src|href)=["']https?:/i, `${name}: prototype must not require the network`);
  assert.doesNotMatch(html, /(service_role|SUPABASE_SECRET|APP_SECRET|sk-[A-Za-z0-9_-]{16,})/, `${name}: possible secret marker`);
  for (const concept of requiredConcepts) assert.ok(html.includes(concept), `${name}: missing required concept “${concept}”`);
  assert.ok(
    html.indexOf("讲得差不多了") < html.indexOf("把对话整理成候选"),
    `${name}: candidate must follow an explicit user-controlled end to storytelling`,
  );

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, `${name}: missing inline interaction script`);
  new Function(scriptMatch[1]);

  const stubs = browserStubs();
  const context = vm.createContext({ ...stubs, console, globalThis: null });
  context.globalThis = context;
  vm.runInContext(`${scriptMatch[1]}\n;globalThis.__prototype = { coreOrder, stateOrder, screens, actionMap };`, context, { filename: file.pathname });
  const model = context.__prototype;
  const allStates = [...model.coreOrder, ...model.stateOrder];
  assert.equal(new Set(allStates).size, allStates.length, `${name}: duplicate state name`);
  for (const state of allStates) {
    assert.equal(typeof model.screens[state], "function", `${name}: missing renderer for ${state}`);
    const rendered = model.screens[state]();
    assert.ok(rendered.includes("<section"), `${name}: ${state} does not render a screen`);
    assert.ok(!rendered.includes("undefined"), `${name}: ${state} renders undefined content`);
  }
  for (const [state, actions] of Object.entries(model.actionMap)) {
    assert.ok(model.screens[state], `${name}: actions reference missing source state ${state}`);
    for (const [, target] of actions) assert.ok(model.screens[target], `${name}: action from ${state} targets missing state ${target}`);
  }
  assert.ok(model.coreOrder.length >= 15, `${name}: core flow is incomplete`);
  assert.ok(model.stateOrder.length >= 10, `${name}: recovery coverage is incomplete`);
  console.log(`${name}: ${model.coreOrder.length} core states, ${model.stateOrder.length} recovery states — OK`);
}

const conversationHtml = await readFile(conversationDemo, "utf8");
assert.match(conversationHtml, /<meta name="viewport"/i, "conversation-demo: missing viewport metadata");
assert.doesNotMatch(conversationHtml, /<(script|link|img)[^>]+(?:src|href)=["']https?:/i, "conversation-demo: must not require the network");
assert.doesNotMatch(conversationHtml, /(service_role|SUPABASE_SECRET|APP_SECRET|sk-[A-Za-z0-9_-]{16,})/, "conversation-demo: possible secret marker");
assert.doesNotMatch(conversationHtml, /让\s*AI\s*问一句/, "conversation-demo: AI reply must not require a manual trigger");
for (const marker of ["id=\"input\"", "id=\"send\"", "id=\"voice\"", "id=\"finish\"", "id=\"candidate-slot\"", "我还没说完，回到对话", "仍未发送"]) {
  assert.ok(conversationHtml.includes(marker), `conversation-demo: missing interaction marker ${marker}`);
}
const conversationScript = conversationHtml.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(conversationScript, "conversation-demo: missing inline interaction script");
new Function(conversationScript[1]);
console.log("conversation-demo: input, automatic reply, voice simulation, user-controlled candidate — OK");

console.log("Prototype verification passed.");

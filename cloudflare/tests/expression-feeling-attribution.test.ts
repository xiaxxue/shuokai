import assert from "node:assert/strict";
import test from "node:test";
import { generateExpressionCandidate } from "../src/expression-ai.ts";

function validNvcExpressionResult() {
  return {
    mode: "NVC",
    fields: {
      observation: "男朋友在半夜吵架后说他很烦",
      feeling: "难过、不舒服",
      need: "被关心",
      request: "希望他提醒我睡觉",
    },
    uncertainties: [],
    conversation: {
      state: "READY",
      reflection: "你听到男朋友说他很烦时，感到难过和不舒服。",
      tentativeUnderstanding: "",
      question: "",
      questionIntent: "NONE",
      stopReason: "SUFFICIENT_CONTEXT",
    },
    grounding: {
      observation: { status: "USER_STATED", sources: ["SOURCE"] },
      feeling: { status: "USER_STATED", sources: ["TURN.1.ANSWER"] },
      need: { status: "USER_STATED", sources: ["SOURCE"] },
      request: { status: "USER_STATED", sources: ["SOURCE"] },
    },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  };
}

test("NVC expression retries when the feeling belongs only to the other person", async () => {
  let calls = 0;
  const generated = await generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        const result = validNvcExpressionResult();
        if (calls === 1) {
          result.fields.feeling = "烦";
          result.grounding.feeling = { status: "USER_STATED", sources: ["SOURCE"] };
        }
        return { response: JSON.stringify(result) };
      },
    },
  }, {
    mode: "NVC",
    sourceText: "男朋友在半夜凌晨一两点钟吵架后，说‘你总是大晚上吵’，并表现出很烦，说他受不了了。\n\n" +
      "<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n" + JSON.stringify({
        privateClarifications: [{ question: "你当时是什么感受？", answer: "我很难过，也不舒服。" }],
      }),
  });
  assert.equal(calls, 2);
  assert.equal((generated.result as { fields: { feeling: string } }).fields.feeling, "难过、不舒服");
});

test("NVC expression keeps a feeling explicitly corrected in the current draft", async () => {
  let calls = 0;
  const generated = await generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        const result = validNvcExpressionResult();
        result.fields.feeling = "烦";
        result.grounding.feeling = { status: "USER_STATED", sources: ["CURRENT_DRAFT"] };
        return { response: JSON.stringify(result) };
      },
    },
  }, {
    mode: "NVC",
    sourceText: "男朋友说他很烦。",
    manualPayload: { feeling: "烦" },
  });
  assert.equal(calls, 1);
  assert.equal((generated.result as { fields: { feeling: string } }).fields.feeling, "烦");
});

test("NVC expression accepts the user's feeling when another person caused it", async () => {
  let calls = 0;
  const generated = await generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        const result = validNvcExpressionResult();
        result.fields.feeling = "烦";
        result.grounding.feeling = { status: "USER_STATED", sources: ["SOURCE"] };
        return { response: JSON.stringify(result) };
      },
    },
  }, {
    mode: "NVC",
    sourceText: "男朋友一直催我，让我很烦。",
  });
  assert.equal(calls, 1);
  assert.equal((generated.result as { fields: { feeling: string } }).fields.feeling, "烦");
});

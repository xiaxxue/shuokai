const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomCodePattern = /^[A-Z0-9]{7}$/;

type RpcArgs = Record<string, unknown>;

const specs = {
  create_room: { optional: { p_display_name: 60 } },
  join_room: { required: { p_code: 7 }, optional: { p_display_name: 60 } },
  set_room_goal: { required: { p_room_id: 36, p_goal: 80 } },
  save_private_draft: {
    required: { p_room_id: 36, p_transcript: 12000 },
    optional: { p_clarification: 3000 },
  },
  approve_perspective: {
    required: {
      p_room_id: 36,
      p_fact: 1000,
      p_meaning: 1000,
      p_impact: 1000,
      p_request: 1000,
    },
  },
  propose_agreement: {
    required: { p_room_id: 36, p_proposal: 2000, p_review_at: 64 },
  },
  accept_agreement: { required: { p_room_id: 36 } },
  get_room_snapshot: { required: { p_room_id: 36 } },
  create_room_v2: { optional: { p_display_name: 60 } },
  join_room_v2: { required: { p_code: 7 }, optional: { p_display_name: 60 } },
  set_room_goal_v2: { required: { p_room_id: 36, p_goal: 80 } },
  get_expression_workspace_v2: { required: { p_room_id: 36 } },
  get_ai_job_status_v2: { required: { p_job_id: 36 } },
  confirm_expression_version_v2: { required: { p_room_id: 36 } },
  pause_room_v2: { required: { p_room_id: 36 } },
  save_expression_workspace_v2: { required: { p_room_id: 36 } },
} as const;

export type AllowedRpcMethod = keyof typeof specs;

export function isAllowedRpcMethod(value: string): value is AllowedRpcMethod {
  return Object.hasOwn(specs, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRpcArgs(method: AllowedRpcMethod, input: unknown): RpcArgs | null {
  if (!isRecord(input)) return null;
  if (method === "confirm_expression_version_v2") {
    const { p_room_id: roomId, p_expected_revision: revision, p_payload: payload } = input;
    if (Object.keys(input).length !== 3 || typeof roomId !== "string" || !uuidPattern.test(roomId) ||
      typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 ||
      !isRecord(payload) || JSON.stringify(payload).length > 16000) return null;
    return { p_room_id: roomId, p_expected_revision: revision, p_payload: payload };
  }
  if (method === "save_expression_workspace_v2") {
    const {
      p_room_id: roomId,
      p_expected_revision: revision,
      p_source_text: sourceText,
      p_selected_mode: selectedMode,
      p_manual_payload: manualPayload,
    } = input;
    if (Object.keys(input).length !== 5 || typeof roomId !== "string" || !uuidPattern.test(roomId) ||
      typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 ||
      typeof sourceText !== "string" || !sourceText.trim() || sourceText.length > 12000 ||
      !["NVC", "FACT_DISPUTE", "BOUNDARY", "PAUSE"].includes(String(selectedMode)) ||
      !isRecord(manualPayload) || JSON.stringify(manualPayload).length > 16000) return null;
    return {
      p_room_id: roomId,
      p_expected_revision: revision,
      p_source_text: sourceText.trim(),
      p_selected_mode: selectedMode,
      p_manual_payload: manualPayload,
    };
  }
  const spec = specs[method];
  const required = "required" in spec ? spec.required : {};
  const optional = "optional" in spec ? spec.optional : {};
  const allowedKeys = new Set([...Object.keys(required), ...Object.keys(optional)]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return null;

  const result: RpcArgs = {};
  for (const [key, maxLength] of Object.entries(required)) {
    const value = input[key];
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > Number(maxLength)) return null;
    result[key] = normalized;
  }
  for (const [key, maxLength] of Object.entries(optional)) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > Number(maxLength)) return null;
    result[key] = normalized;
  }

  if ("p_room_id" in result && !uuidPattern.test(String(result.p_room_id))) return null;
  if ("p_job_id" in result && !uuidPattern.test(String(result.p_job_id))) return null;
  if ("p_review_at" in result && Number.isNaN(Date.parse(String(result.p_review_at)))) return null;
  if ("p_code" in result) {
    result.p_code = String(result.p_code).toUpperCase();
    if (!roomCodePattern.test(String(result.p_code))) return null;
  }
  return result;
}

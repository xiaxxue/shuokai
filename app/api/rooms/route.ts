import { getD1 } from "../../../db";
import { ensureSchema } from "../../../db/runtime";
import { canTransition, type RoomState } from "../../../lib/room-state";

export const dynamic = "force-dynamic";

type Role = "A" | "B";
type RoomRow = {
  id: string;
  code: string;
  state: RoomState;
  goal: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
};
type ParticipantRow = {
  id: string;
  room_id: string;
  role: Role;
  display_name: string;
};
type ApprovedCards = {
  fact: string;
  meaning: string;
  impact: string;
  request: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function createToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function getRoom(roomId: string) {
  const room = await getD1()
    .prepare("SELECT * FROM rooms WHERE id = ?")
    .bind(roomId)
    .first<RoomRow>();
  if (!room) throw new ApiError("沟通房间不存在或已经失效。", 404);
  return room;
}

async function authenticate(roomId: string, token: string) {
  if (!roomId || !token) throw new ApiError("缺少房间身份凭证。", 401);
  const tokenHash = await hashToken(token);
  const participant = await getD1()
    .prepare(
      "SELECT id, room_id, role, display_name FROM participants WHERE room_id = ? AND token_hash = ?",
    )
    .bind(roomId, tokenHash)
    .first<ParticipantRow>();
  if (!participant) throw new ApiError("房间身份凭证无效。", 403);
  return participant;
}

async function transition(
  room: RoomRow,
  participantId: string | null,
  eventType: string,
  toState: RoomState,
  payload: Record<string, unknown> = {},
) {
  if (!canTransition(room.state, toState)) {
    throw new ApiError(`当前状态 ${room.state} 不能执行这个操作。`, 409);
  }
  const result = await getD1()
    .prepare(
      "UPDATE rooms SET state = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = ?",
    )
    .bind(toState, room.id, room.state)
    .run();
  if (!result.meta.changes) {
    throw new ApiError("房间刚刚发生了变化，请刷新后重试。", 409);
  }
  await getD1()
    .prepare(
      "INSERT INTO room_events (room_id, participant_id, event_type, from_state, to_state, payload) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      room.id,
      participantId,
      eventType,
      room.state,
      toState,
      JSON.stringify(payload),
    )
    .run();
  return toState;
}

async function createSharedView(roomId: string) {
  await getD1()
    .prepare(
      `INSERT INTO shared_views
       (id, room_id, common_ground, disagreement, core_question)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(room_id) DO UPDATE SET
         version = version + 1,
         common_ground = excluded.common_ground,
         disagreement = excluded.disagreement,
         core_question = excluded.core_question,
         created_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      createId("view"),
      roomId,
      "双方都希望周末可以放松，也不想每次计划变化都变成一次争吵。",
      "A 希望一旦知道计划可能变化就尽早告知；B 希望在变化确定以后再给出明确通知。",
      "知道可能有变化时就应该告知，还是确定取消以后再告知？",
    )
    .run();
}

function readCards(value: unknown): ApprovedCards {
  if (!value || typeof value !== "object") {
    throw new ApiError("缺少需要本人批准的观点卡。", 400);
  }
  const source = value as Record<string, unknown>;
  const cards = {
    fact: cleanText(source.fact, 1000),
    meaning: cleanText(source.meaning, 1000),
    impact: cleanText(source.impact, 1000),
    request: cleanText(source.request, 1000),
  };
  if (Object.values(cards).some((item) => !item)) {
    throw new ApiError("四张观点卡都需要由本人确认。", 400);
  }
  return cards;
}

async function insertPerspective(
  roomId: string,
  participantId: string,
  cards: ApprovedCards,
) {
  const latest = await getD1()
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS version FROM perspectives WHERE room_id = ? AND participant_id = ?",
    )
    .bind(roomId, participantId)
    .first<{ version: number }>();
  const version = (latest?.version ?? 0) + 1;
  await getD1()
    .prepare(
      `INSERT INTO perspectives
       (id, room_id, participant_id, version, fact, meaning, impact, request)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId("perspective"),
      roomId,
      participantId,
      version,
      cards.fact,
      cards.meaning,
      cards.impact,
      cards.request,
    )
    .run();
  return version;
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const roomId = cleanText(url.searchParams.get("roomId"), 100);
    const token = cleanText(readBearerToken(request), 200);
    const participant = await authenticate(roomId, token);
    const room = await getRoom(roomId);
    const db = getD1();

    const [participantsResult, ownDraft, ownPerspective, eventResult] =
      await Promise.all([
        db
          .prepare(
            "SELECT role, display_name, joined_at FROM participants WHERE room_id = ? ORDER BY role",
          )
          .bind(roomId)
          .all(),
        db
          .prepare(
            "SELECT transcript, clarification, created_at FROM private_drafts WHERE room_id = ? AND participant_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .bind(roomId, participant.id)
          .first(),
        db
          .prepare(
            "SELECT version, fact, meaning, impact, request, approved_at FROM perspectives WHERE room_id = ? AND participant_id = ? ORDER BY version DESC LIMIT 1",
          )
          .bind(roomId, participant.id)
          .first(),
        db
          .prepare(
            "SELECT event_type, from_state, to_state, created_at FROM room_events WHERE room_id = ? ORDER BY id DESC LIMIT 30",
          )
          .bind(roomId)
          .all(),
      ]);

    const isShared = [
      "COMMON_VIEW_READY",
      "AGREEMENT_PENDING",
      "COMPLETED",
    ].includes(room.state);
    const approvedPerspectives = isShared
      ? await db
          .prepare(
            `SELECT p.version, p.fact, p.meaning, p.impact, p.request,
                    p.approved_at, u.role, u.display_name
             FROM perspectives p
             JOIN participants u ON u.id = p.participant_id
             WHERE p.room_id = ?
             AND p.version = (
               SELECT MAX(p2.version) FROM perspectives p2
               WHERE p2.room_id = p.room_id AND p2.participant_id = p.participant_id
             )
             ORDER BY u.role`,
          )
          .bind(roomId)
          .all()
      : { results: [] };
    const sharedView = isShared
      ? await db
          .prepare("SELECT * FROM shared_views WHERE room_id = ?")
          .bind(roomId)
          .first()
      : null;
    const agreement = isShared
      ? await db
          .prepare("SELECT * FROM agreements WHERE room_id = ?")
          .bind(roomId)
          .first()
      : null;

    return Response.json({
      room,
      me: participant,
      participants: participantsResult.results,
      privateDraft: ownDraft,
      ownPerspective,
      approvedPerspectives: approvedPerspectives.results,
      sharedView,
      agreement,
      events: eventResult.results,
      privacy: {
        rawDraftVisibility: "owner_only",
        sharedContentRule: "approved_perspectives_only",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 60);
    if (action === "create") return createRoom(body);
    if (action === "join") return joinRoom(body);

    const roomId = cleanText(body.roomId, 100);
    const token = cleanText(readBearerToken(request) || body.token, 200);
    const participant = await authenticate(roomId, token);
    const room = await getRoom(roomId);

    if (action === "set_goal") {
      if (participant.role !== "A") throw new ApiError("只有发起者可以设置目标。", 403);
      const goal = cleanText(body.goal, 80);
      if (!goal) throw new ApiError("请选择本次沟通目标。", 400);
      await getD1()
        .prepare("UPDATE rooms SET goal = ? WHERE id = ?")
        .bind(goal, roomId)
        .run();
      const state = await transition(room, participant.id, "GOAL_SELECTED", "A_DRAFTING", { goal });
      return Response.json({ state });
    }

    if (action === "save_draft") {
      const transcript = cleanText(body.transcript, 12000);
      const clarification = cleanText(body.clarification, 3000);
      if (!transcript) throw new ApiError("表达内容不能为空。", 400);
      const expected = participant.role === "A" ? "A_DRAFTING" : "B_DRAFTING";
      const next = participant.role === "A" ? "A_REVIEWING" : "B_REVIEWING";
      if (room.state !== expected) throw new ApiError("当前阶段不能提交私人表达。", 409);
      await getD1()
        .prepare(
          "INSERT INTO private_drafts (id, room_id, participant_id, transcript, clarification) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(createId("draft"), roomId, participant.id, transcript, clarification || null)
        .run();
      const state = await transition(
        room,
        participant.id,
        `${participant.role}_DRAFT_READY`,
        next,
        { transcriptLength: transcript.length },
      );
      return Response.json({ state });
    }

    if (action === "approve_perspective") {
      const expected = participant.role === "A" ? "A_REVIEWING" : "B_REVIEWING";
      if (room.state !== expected) throw new ApiError("当前阶段不能批准观点卡。", 409);
      const cards = readCards(body.cards);
      const version = await insertPerspective(roomId, participant.id, cards);
      const next = participant.role === "A" ? "WAITING_FOR_B" : "COMMON_VIEW_READY";
      if (participant.role === "B") await createSharedView(roomId);
      const state = await transition(
        room,
        participant.id,
        `${participant.role}_PERSPECTIVE_APPROVED`,
        next,
        { version },
      );
      return Response.json({ state, version });
    }

    if (action === "simulate_partner") {
      if (participant.role !== "A" || room.state !== "WAITING_FOR_B") {
        throw new ApiError("只有等待对方时才能运行双人演示。", 409);
      }
      const partnerToken = createToken();
      const partnerId = createId("participant");
      await getD1()
        .prepare(
          "INSERT INTO participants (id, room_id, role, display_name, token_hash) VALUES (?, ?, 'B', ?, ?)",
        )
        .bind(partnerId, roomId, "Jun", await hashToken(partnerToken))
        .run();
      const version = await insertPerspective(roomId, partnerId, {
        fact: "周六上午才确定身体状态不适合外出，并在确认后告诉了对方。",
        meaning: "担心过早说‘可能取消’会制造不必要的焦虑，也希望周末保留调整空间。",
        impact: "在身体不舒服时仍感到需要立即解释清楚，压力变得更大。",
        request: "计划还不确定时可以先说明待定，但不希望被要求立刻给出完整解释。",
      });
      await createSharedView(roomId);
      const state = await transition(
        room,
        partnerId,
        "B_PERSPECTIVE_APPROVED",
        "COMMON_VIEW_READY",
        { version, demo: true },
      );
      return Response.json({ state, partnerToken });
    }

    if (action === "propose_agreement") {
      const proposal = cleanText(body.proposal, 3000);
      const reviewAt = cleanText(body.reviewAt, 80);
      if (!proposal || !reviewAt) throw new ApiError("约定内容和复盘时间不能为空。", 400);
      await getD1()
        .prepare(
          `INSERT INTO agreements (id, room_id, proposal, review_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(room_id) DO UPDATE SET
             proposal = excluded.proposal,
             review_at = excluded.review_at`,
        )
        .bind(createId("agreement"), roomId, proposal, reviewAt)
        .run();
      const state = await transition(
        room,
        participant.id,
        "AGREEMENT_PROPOSED",
        "AGREEMENT_PENDING",
      );
      return Response.json({ state });
    }

    if (action === "accept_agreement") {
      if (room.state !== "AGREEMENT_PENDING") {
        throw new ApiError("当前没有等待确认的约定。", 409);
      }
      const column = participant.role === "A" ? "accepted_a" : "accepted_b";
      await getD1()
        .prepare(`UPDATE agreements SET ${column} = 1 WHERE room_id = ?`)
        .bind(roomId)
        .run();
      const agreement = await getD1()
        .prepare("SELECT accepted_a, accepted_b FROM agreements WHERE room_id = ?")
        .bind(roomId)
        .first<{ accepted_a: number; accepted_b: number }>();
      if (agreement?.accepted_a && agreement.accepted_b) {
        await getD1()
          .prepare("UPDATE agreements SET activated_at = CURRENT_TIMESTAMP WHERE room_id = ?")
          .bind(roomId)
          .run();
        const state = await transition(
          room,
          participant.id,
          "AGREEMENT_ACTIVATED",
          "COMPLETED",
        );
        return Response.json({ state, completed: true });
      }
      await getD1()
        .prepare(
          "INSERT INTO room_events (room_id, participant_id, event_type, from_state, to_state, payload) VALUES (?, ?, ?, ?, ?, '{}')",
        )
        .bind(
          roomId,
          participant.id,
          `${participant.role}_ACCEPTED_AGREEMENT`,
          room.state,
          room.state,
        )
        .run();
      return Response.json({ state: room.state, completed: false });
    }

    throw new ApiError("未知操作。", 400);
  } catch (error) {
    return handleError(error);
  }
}

async function createRoom(body: Record<string, unknown>) {
  const roomId = createId("room");
  const participantId = createId("participant");
  const token = createToken();
  const code = createCode();
  const displayName = cleanText(body.displayName, 40) || "Lin";
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = getD1();
  await db.batch([
    db
      .prepare(
        "INSERT INTO rooms (id, code, state, expires_at) VALUES (?, ?, 'GOAL_SETTING', ?)",
      )
      .bind(roomId, code, expiresAt),
    db
      .prepare(
        "INSERT INTO participants (id, room_id, role, display_name, token_hash) VALUES (?, ?, 'A', ?, ?)",
      )
      .bind(participantId, roomId, displayName, await hashToken(token)),
    db
      .prepare(
        "INSERT INTO room_events (room_id, participant_id, event_type, from_state, to_state, payload) VALUES (?, ?, 'SESSION_STARTED', 'READY', 'GOAL_SETTING', '{}')",
      )
      .bind(roomId, participantId),
  ]);
  return Response.json(
    { roomId, code, state: "GOAL_SETTING", role: "A", participantToken: token },
    { status: 201 },
  );
}

async function joinRoom(body: Record<string, unknown>) {
  const code = cleanText(body.code, 12).toUpperCase();
  const displayName = cleanText(body.displayName, 40) || "对方";
  if (!code) throw new ApiError("请输入房间码。", 400);
  const room = await getD1()
    .prepare("SELECT * FROM rooms WHERE code = ?")
    .bind(code)
    .first<RoomRow>();
  if (!room) throw new ApiError("找不到这个沟通房间。", 404);
  if (room.state !== "WAITING_FOR_B") {
    throw new ApiError("这个房间目前不能加入。", 409);
  }
  const participantId = createId("participant");
  const token = createToken();
  await getD1()
    .prepare(
      "INSERT INTO participants (id, room_id, role, display_name, token_hash) VALUES (?, ?, 'B', ?, ?)",
    )
    .bind(participantId, room.id, displayName, await hashToken(token))
    .run();
  const state = await transition(room, participantId, "B_JOINED", "B_DRAFTING");
  return Response.json(
    { roomId: room.id, code: room.code, state, role: "B", participantToken: token },
    { status: 201 },
  );
}

function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "未知错误";
  console.error("rooms_api_error", message);
  return Response.json({ error: "服务暂时不可用，请稍后重试。" }, { status: 500 });
}

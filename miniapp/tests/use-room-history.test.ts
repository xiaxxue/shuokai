import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RoomHistoryPage } from "../src/domain/room-history";
import { useRoomHistory } from "../src/composables/use-room-history";

const emptyPage: RoomHistoryPage = { items: [], hasMore: false, nextCursor: null };

describe("room history state", () => {
  it("drops a late response after the account changes", async () => {
    let resolvePage: (page: RoomHistoryPage) => void = () => undefined;
    const deferred = new Promise<RoomHistoryPage>((resolve) => { resolvePage = resolve; });
    const owner = ref("user-a");
    const history = useRoomHistory(owner, vi.fn(() => deferred));

    const loading = history.load(true);
    owner.value = "user-b";
    history.reset();
    resolvePage(emptyPage);
    await loading;

    expect(history.items.value).toEqual([]);
    expect(history.loading.value).toBe(false);
  });

  it("deduplicates cursor pages by room id", async () => {
    const owner = ref("user-a");
    const first = {
      roomId: "71000000-0000-4000-8000-000000000001",
      code: "HIST2AA",
      state: "GOAL_SETTING",
      goal: null,
      topic: null,
      workflowVersion: 2,
      phaseV2: "SETUP",
      dialogueRound: 0,
      role: "A",
      participantCount: 1,
      createdAt: "2026-08-10T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
      expiresAt: "2026-08-24T10:00:00.000Z",
    } as const;
    const loader = vi.fn()
      .mockResolvedValueOnce({ items: [first], hasMore: true, nextCursor: { updatedAt: first.updatedAt, roomId: first.roomId } })
      .mockResolvedValueOnce({ items: [first], hasMore: false, nextCursor: null });
    const history = useRoomHistory(owner, loader);

    await history.load(true);
    await history.load(false);

    expect(history.items.value).toHaveLength(1);
    expect(loader).toHaveBeenLastCalledWith({ updatedAt: first.updatedAt, roomId: first.roomId });
  });
});

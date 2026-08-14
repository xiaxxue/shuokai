import { ref, type Ref } from "vue";
import type { RoomHistoryCursor, RoomHistoryItem, RoomHistoryPage } from "../domain/room-history";

type RoomHistoryLoader = (
  cursor: RoomHistoryCursor | null,
  limit?: number,
) => Promise<RoomHistoryPage>;

export function useRoomHistory(ownerUserId: Ref<string>, loader: RoomHistoryLoader) {
  const items = ref<RoomHistoryItem[]>([]);
  const cursor = ref<RoomHistoryCursor | null>(null);
  const loading = ref(false);
  const error = ref("");
  let generation = 0;

  function reset() {
    generation += 1;
    items.value = [];
    cursor.value = null;
    error.value = "";
    loading.value = false;
  }

  async function load(resetPage: boolean) {
    if (!ownerUserId.value || loading.value) return;
    const requestGeneration = generation;
    const requestOwner = ownerUserId.value;
    loading.value = true;
    error.value = "";
    try {
      const page = await loader(resetPage ? null : cursor.value);
      if (requestGeneration !== generation || requestOwner !== ownerUserId.value) return;
      if (resetPage) items.value = page.items;
      else {
        const seen = new Set(items.value.map((item) => item.roomId));
        items.value = [...items.value, ...page.items.filter((item) => !seen.has(item.roomId))];
      }
      cursor.value = page.nextCursor;
    } catch (reason) {
      if (requestGeneration !== generation || requestOwner !== ownerUserId.value) return;
      error.value = reason instanceof Error ? reason.message : "暂时无法读取历史沟通。";
    } finally {
      if (requestGeneration === generation && requestOwner === ownerUserId.value) loading.value = false;
    }
  }

  return { items, cursor, loading, error, load, reset };
}

export type Notice = {
  kind: "info" | "success" | "error";
  message: string;
};

export const SUCCESS_NOTICE_DURATION_MS = 1800;

export function createNoticeController(update: (notice: Notice | null) => void) {
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelScheduledDismiss() {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  function clear() {
    cancelScheduledDismiss();
    update(null);
  }

  function show(kind: Notice["kind"], message: string) {
    cancelScheduledDismiss();
    update({ kind, message });
    if (kind !== "success") return;
    dismissTimer = setTimeout(() => {
      dismissTimer = null;
      update(null);
    }, SUCCESS_NOTICE_DURATION_MS);
  }

  return {
    clear,
    show,
    dispose: cancelScheduledDismiss,
  };
}

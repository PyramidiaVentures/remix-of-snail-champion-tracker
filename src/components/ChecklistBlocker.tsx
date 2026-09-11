import { useBlocker } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

/**
 * Blocks navigation away from a session page while its SOP checklist is
 * incomplete. Shows a popup with two choices: leave and come back later,
 * or stay and tick the boxes now.
 */
export function ChecklistBlocker({ started, allDone }: { started: boolean; allDone: boolean }) {
  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: () => started && !allDone,
    withResolver: true,
    enableBeforeUnload: started && !allDone,
  });

  if (status !== "blocked") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="h-6 w-6 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-sm leading-snug">
            You haven't checked all of the boxes in the SOP list. Please do so before completing.
          </p>
        </div>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            I will check it now
          </button>
          <button
            type="button"
            onClick={proceed}
            className="w-full rounded-xl border border-border bg-card py-3 text-sm font-medium"
          >
            I will come back to the task
          </button>
        </div>
      </div>
    </div>
  );
}

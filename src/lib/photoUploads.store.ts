import { useSyncExternalStore } from "react";

export type UploadStatus = "uploading" | "saved" | "failed";

type Entry = { status: UploadStatus; url?: string; error?: string };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let cached: ReadonlyMap<string, Entry> = new Map();

function emit() {
  snapshotVersion++;
  cached = new Map(entries);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Runs an upload outside React so it survives the card unmounting on navigation. */
export function runUpload(key: string, task: () => Promise<string>, onDone?: (url: string) => void) {
  entries.set(key, { status: "uploading" });
  emit();
  void task()
    .then((url) => {
      entries.set(key, { status: "saved", url });
      emit();
      onDone?.(url);
    })
    .catch((e: unknown) => {
      entries.set(key, { status: "failed", error: e instanceof Error ? e.message : "upload failed" });
      emit();
    });
}

export function clearUpload(key: string) {
  if (entries.delete(key)) emit();
}

export function useUploads(): ReadonlyMap<string, Entry> {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached,
  );
}

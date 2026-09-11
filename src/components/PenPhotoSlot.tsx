import { useRef } from "react";
import { Upload, AlertTriangle, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { uploadTrialPenPhoto, type PhotoKind } from "@/lib/photoUpload";
import { runUpload, useUploads } from "@/lib/photoUploads.store";
import { useSignedPhotoUrl } from "@/lib/useSignedPhotoUrl";

export function penPhotoKey(trial_id: string, pen_id: string, obs_date: string, kind: PhotoKind) {
  return `${trial_id}|${pen_id}|${obs_date}|${kind}`;
}

interface Props {
  trial_id: string;
  pen_id: string;
  obs_date: string;
  kind: PhotoKind;
  label: string;
  existingUrl: string | null;
  onSaved?: (url: string) => void;
}

/** One photo slot per pen. Uploads run outside React so moving to the next pen
 *  never cancels or blocks them. */
export function PenPhotoSlot({ trial_id, pen_id, obs_date, kind, label, existingUrl, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const key = penPhotoKey(trial_id, pen_id, obs_date, kind);
  const entry = useUploads().get(key);

  const status = entry?.status ?? (existingUrl ? "saved" : "empty");
  const stored = entry?.url ?? existingUrl;
  const url = useSignedPhotoUrl(stored);

  const start = (file: File) =>
    runUpload(key, () => uploadTrialPenPhoto({ trial_id, pen_id, obs_date, kind, file }), (u) => onSaved?.(u));

  const btnLabel =
    status === "saved" ? "Replace photo"
    : status === "uploading" ? "Uploading…"
    : status === "failed" ? "Failed — tap to retry"
    : "Upload photo";

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium">{label}</div>
        {status === "saved" && <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="h-3 w-3" />saved</span>}
        {status === "uploading" && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />uploading</span>}
        {status === "failed" && <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" />failed</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) start(file);
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            status === "saved" ? "border-primary/50 bg-primary/5 text-primary"
              : status === "failed" ? "border-destructive/50 bg-destructive/5 text-destructive"
              : "border-border bg-card"
          }`}
        >
          {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" />
            : status === "failed" ? <AlertTriangle className="h-4 w-4" />
            : status === "saved" ? <RefreshCw className="h-4 w-4" />
            : <Upload className="h-4 w-4" />}
          <span>{btnLabel}</span>
        </button>
        {url && (
          <button type="button" onClick={() => window.open(url, "_blank")} className="shrink-0">
            <img src={url} alt={label} loading="lazy" decoding="async"
              className="h-14 w-14 rounded-md border border-border object-cover" />
          </button>
        )}
      </div>
      {status === "failed" && entry?.error && (
        <div className="text-[10px] text-destructive truncate" title={entry.error}>{entry.error}</div>
      )}
    </div>
  );
}

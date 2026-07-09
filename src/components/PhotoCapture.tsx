import { useEffect, useRef, useState } from "react";
import { Camera, AlertTriangle, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { signedPhotoUrl, uploadFieldPhoto, type PhotoKind } from "@/lib/photoUpload";

export type PhotoStatus = "empty" | "uploading" | "saved" | "failed";

interface Props {
  round_id: string;
  pen_id: string;
  feed_id: string;
  obs_date: string;
  kind: PhotoKind;
  /** Existing storage path from photo_am_url / photo_pm_url. */
  existingPath: string | null;
  onSaved?: (path: string) => void;
}

export function PhotoCapture({ round_id, pen_id, feed_id, obs_date, kind, existingPath, onSaved }: Props) {
  const [status, setStatus] = useState<PhotoStatus>(existingPath ? "saved" : "empty");
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  // Refresh signed URL whenever the underlying path changes.
  useEffect(() => {
    let cancelled = false;
    if (!existingPath) { setThumbUrl(null); return; }
    setStatus((s) => (s === "uploading" || s === "failed" ? s : "saved"));
    signedPhotoUrl(existingPath).then((url) => { if (!cancelled) setThumbUrl(url); });
    return () => { cancelled = true; };
  }, [existingPath]);

  const doUpload = async (file: File) => {
    setLastFile(file);
    setStatus("uploading");
    setErrorMsg(null);
    // Instant local preview
    try { setThumbUrl(URL.createObjectURL(file)); } catch { /* ignore */ }
    try {
      const path = await uploadFieldPhoto({ round_id, pen_id, feed_id, obs_date, kind, file });
      setStatus("saved");
      onSaved?.(path);
      // Refresh with a signed URL from storage
      const url = await signedPhotoUrl(path);
      if (url) setThumbUrl(url);
    } catch (e) {
      setStatus("failed");
      setErrorMsg(e instanceof Error ? e.message : "upload failed");
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) void doUpload(file);
    e.currentTarget.value = "";
  };

  const retry = () => { if (lastFile) void doUpload(lastFile); else inputRef.current?.click(); };

  const label =
    status === "saved" ? "Retake photo"
    : status === "uploading" ? "Uploading…"
    : status === "failed" ? "Failed — tap to retry"
    : `Take ${kind.toUpperCase()} photo`;

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={onPick} />
      <button type="button"
        onClick={status === "failed" ? retry : () => inputRef.current?.click()}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium
          ${status === "saved" ? "border-primary/50 bg-primary/5 text-primary"
            : status === "failed" ? "border-destructive/50 bg-destructive/5 text-destructive"
            : status === "uploading" ? "border-border bg-muted text-muted-foreground"
            : "border-border bg-card text-foreground"}`}>
        {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" />
          : status === "failed" ? <AlertTriangle className="h-4 w-4" />
          : status === "saved" ? <CheckCircle2 className="h-4 w-4" />
          : <Camera className="h-4 w-4" />}
        <span>{label}</span>
        {status === "saved" && <RefreshCw className="h-3 w-3 opacity-60" />}
      </button>
      {thumbUrl && (
        <button type="button" onClick={() => window.open(thumbUrl, "_blank")}
          className="relative shrink-0">
          <img src={thumbUrl} alt="field photo"
            className={`h-12 w-12 rounded-md object-cover border ${status === "failed" ? "border-destructive/50 opacity-60" : "border-border"}`} />
        </button>
      )}
      {status === "failed" && errorMsg && (
        <span className="text-[10px] text-destructive truncate max-w-[8rem]" title={errorMsg}>{errorMsg}</span>
      )}
    </div>
  );
}

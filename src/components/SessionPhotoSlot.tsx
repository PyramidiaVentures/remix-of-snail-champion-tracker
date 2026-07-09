import { useRef, useState } from "react";
import { Upload, AlertTriangle, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { uploadSessionPhoto, type PhotoKind } from "@/lib/photoUpload";

type Status = "empty" | "uploading" | "saved" | "failed";

interface Props {
  round_id: string;
  /** null = control cage slot */
  pen_id: string | null;
  obs_date: string;
  kind: PhotoKind;
  label: string;
  existingUrl: string | null;
  onSaved?: (url: string) => void;
}

export function SessionPhotoSlot({ round_id, pen_id, obs_date, kind, label, existingUrl, onSaved }: Props) {
  const [status, setStatus] = useState<Status>(existingUrl ? "saved" : "empty");
  const [url, setUrl] = useState<string | null>(existingUrl);
  const [preview, setPreview] = useState<string | null>(existingUrl);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doUpload = async (file: File) => {
    setLastFile(file);
    setStatus("uploading");
    setErrorMsg(null);
    try { setPreview(URL.createObjectURL(file)); } catch { /* ignore */ }
    try {
      const publicUrl = await uploadSessionPhoto({ round_id, pen_id, obs_date, kind, file });
      setUrl(publicUrl);
      setPreview(publicUrl);
      setStatus("saved");
      onSaved?.(publicUrl);
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
        {/* NOTE: no `capture` attribute — opens gallery/file picker, not camera */}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        <button type="button"
          onClick={status === "failed" ? retry : () => inputRef.current?.click()}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium
            ${status === "saved" ? "border-primary/50 bg-primary/5 text-primary"
              : status === "failed" ? "border-destructive/50 bg-destructive/5 text-destructive"
              : status === "uploading" ? "border-border bg-muted text-muted-foreground"
              : "border-border bg-card text-foreground"}`}>
          {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" />
            : status === "failed" ? <AlertTriangle className="h-4 w-4" />
            : status === "saved" ? <RefreshCw className="h-4 w-4" />
            : <Upload className="h-4 w-4" />}
          <span>{btnLabel}</span>
        </button>
        {preview && (
          <button type="button" onClick={() => url && window.open(url, "_blank")} className="relative shrink-0">
            <img src={preview} alt={label}
              className={`h-14 w-14 rounded-md object-cover border ${status === "failed" ? "border-destructive/50 opacity-60" : "border-border"}`} />
          </button>
        )}
      </div>
      {status === "failed" && errorMsg && (
        <div className="text-[10px] text-destructive truncate" title={errorMsg}>{errorMsg}</div>
      )}
    </div>
  );
}

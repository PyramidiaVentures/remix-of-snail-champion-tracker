import { supabase } from "@/integrations/supabase/client";

export const PHOTO_BUCKET = "field-photos";
export type PhotoKind = "am" | "pm";

/** Path convention: {round_id}/{pen_id}/{feed_id}/{obs_date}-{am|pm}.jpg */
export function photoPath(args: {
  round_id: string;
  pen_id: string;
  feed_id: string;
  obs_date: string;
  kind: PhotoKind;
}): string {
  return `${args.round_id}/${args.pen_id}/${args.feed_id}/${args.obs_date}-${args.kind}.jpg`;
}

/** Downscale + JPEG-compress a file client-side before upload. */
async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
    // @ts-expect-error - both canvas types support 2d
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    if ("convertToBlob" in canvas) {
      return await (canvas as OffscreenCanvas).convertToBlob({ type: "image/jpeg", quality });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        quality,
      );
    });
  } catch {
    // Fall back to the raw file if resize fails — better to upload something.
    return file;
  }
}

export interface UploadArgs {
  round_id: string;
  pen_id: string;
  feed_id: string;
  obs_date: string;
  kind: PhotoKind;
  file: File;
}

/** Uploads (replacing any existing file at the path) and writes the storage
 *  path onto the matching observations row. Returns the storage path. */
export async function uploadFieldPhoto(args: UploadArgs): Promise<string> {
  const path = photoPath(args);
  const blob = await compressImage(args.file);

  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;

  const column = args.kind === "am" ? "photo_am_url" : "photo_pm_url";
  const { error: dbErr } = await supabase.from("observations").upsert(
    {
      round_id: args.round_id,
      pen_id: args.pen_id,
      feed_id: args.feed_id,
      obs_date: args.obs_date,
      [column]: path,
    },
    { onConflict: "round_id,pen_id,feed_id,obs_date" },
  );
  if (dbErr) throw dbErr;
  return path;
}

/** Generate a short-lived signed URL for viewing. */
export async function signedPhotoUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

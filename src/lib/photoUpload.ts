import { supabase } from "@/integrations/supabase/client";

export const PHOTO_BUCKET = "field-photos";
export type PhotoKind = "am" | "pm";

/** Path convention: {round_id}/{pen_id|control}/{obs_date}-{am|pm}.jpg */
export function photoPath(args: {
  round_id: string;
  pen_id: string | null;
  obs_date: string;
  kind: PhotoKind;
}): string {
  const penSeg = args.pen_id ?? "control";
  return `${args.round_id}/${penSeg}/${args.obs_date}-${args.kind}.jpg`;
}

/** Downscale + JPEG-compress a file client-side before upload. */
async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return file;
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
    return file;
  }
}

export interface SessionUploadArgs {
  round_id: string;
  pen_id: string | null;
  obs_date: string;
  kind: PhotoKind;
  file: File;
}

/** Returns the permanent public URL of a stored object. */
export function publicPhotoUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads a session photo (per pen or control) and upserts session_photos.
 *  Returns the public URL stored on the row. */
export async function uploadSessionPhoto(args: SessionUploadArgs): Promise<string> {
  const path = photoPath(args);
  const blob = await compressImage(args.file);
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;
  const url = publicPhotoUrl(path);

  const column = args.kind === "am" ? "photo_am_url" : "photo_pm_url";
  // We need to upsert honoring the partial unique indexes:
  //   - pen row: (round_id, pen_id, obs_date)
  //   - control row (pen_id NULL): (round_id, obs_date)
  // PostgREST upsert with onConflict can only target one index, so do it manually.
  const existing = await supabase
    .from("session_photos")
    .select("id")
    .eq("round_id", args.round_id)
    .eq("obs_date", args.obs_date)
    .is("pen_id", args.pen_id === null ? null : (undefined as never))
    .maybeSingle();

  // Second query for the pen_id = value case (chained .is() above only handles NULL).
  let existingId: string | null = null;
  if (args.pen_id === null) {
    existingId = existing.data?.id ?? null;
  } else {
    const q = await supabase
      .from("session_photos")
      .select("id")
      .eq("round_id", args.round_id)
      .eq("pen_id", args.pen_id)
      .eq("obs_date", args.obs_date)
      .maybeSingle();
    existingId = q.data?.id ?? null;
  }

  if (existingId) {
    const patch = { [column]: url } as never;
    const { error } = await supabase.from("session_photos").update(patch).eq("id", existingId);
    if (error) throw error;
  } else {
    const insertRow = {
      round_id: args.round_id,
      pen_id: args.pen_id,
      obs_date: args.obs_date,
      [column]: url,
    } as never;
    const { error } = await supabase.from("session_photos").insert(insertRow);
    if (error) throw error;
  }
  return url;
}


export interface TrialPhotoArgs {
  trial_id: string;
  pen_id: string;
  obs_date: string;
  kind: PhotoKind;
  file: File;
}

/** Uploads a trial pen photo and upserts the trial-scoped session_photos row.
 *  Path: {trial_id}/{pen_id}/{obs_date}-{am|pm}.jpg */
export async function uploadTrialPenPhoto(args: TrialPhotoArgs): Promise<string> {
  const path = `${args.trial_id}/${args.pen_id}/${args.obs_date}-${args.kind}.jpg`;
  const blob = await compressImage(args.file);
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;
  const url = publicPhotoUrl(path);
  const column = args.kind === "am" ? "photo_am_url" : "photo_pm_url";

  const { data: existing } = await supabase
    .from("session_photos")
    .select("id")
    .eq("trial_id", args.trial_id)
    .eq("pen_id", args.pen_id)
    .eq("obs_date", args.obs_date)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("session_photos")
      .update({ [column]: url } as never)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("session_photos").insert({
      trial_id: args.trial_id,
      pen_id: args.pen_id,
      obs_date: args.obs_date,
      [column]: url,
    } as never);
    if (error) throw error;
  }
  return url;
}

export interface PopulationPhotoArgs {
  trial_id: string;
  pen_id: string;
  event_date: string;
  file: File;
}

/** Uploads a population-event photo and returns its permanent public URL.
 *  Path: {trial_id}/{pen_id}/{event_date}-pop-{timestamp}.jpg */
export async function uploadPopulationPhoto(args: PopulationPhotoArgs): Promise<string> {
  const path = `${args.trial_id}/${args.pen_id}/${args.event_date}-pop-${Date.now()}.jpg`;
  const blob = await compressImage(args.file);
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return publicPhotoUrl(path);
}

export interface WeighPhotoArgs {
  trial_id: string;
  pen_id: string;
  event_date: string;
  file: File;
}

/** Uploads a weigh-day scale photo and returns its permanent public URL.
 *  Path: {trial_id}/{pen_id}/{event_date}-weigh.jpg
 *  The URL is written to biomass_events.photo_url by the caller. */
export async function uploadWeighPhoto(args: WeighPhotoArgs): Promise<string> {
  const path = `${args.trial_id}/${args.pen_id}/${args.event_date}-weigh.jpg`;
  const blob = await compressImage(args.file);
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return publicPhotoUrl(path);
}

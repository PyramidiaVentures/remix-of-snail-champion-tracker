
ALTER TABLE public.observations DROP COLUMN IF EXISTS photo_am_url;
ALTER TABLE public.observations DROP COLUMN IF EXISTS photo_pm_url;

CREATE TABLE IF NOT EXISTS public.session_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  pen_id uuid REFERENCES public.pens(id) ON DELETE CASCADE,
  obs_date date NOT NULL,
  photo_am_url text,
  photo_pm_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness supporting nullable pen_id
CREATE UNIQUE INDEX IF NOT EXISTS session_photos_round_pen_date_uniq
  ON public.session_photos (round_id, pen_id, obs_date)
  WHERE pen_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS session_photos_round_control_date_uniq
  ON public.session_photos (round_id, obs_date)
  WHERE pen_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_photos TO authenticated;
GRANT ALL ON public.session_photos TO service_role;

ALTER TABLE public.session_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read session_photos" ON public.session_photos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write session_photos" ON public.session_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER session_photos_touch_updated_at
  BEFORE UPDATE ON public.session_photos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies for public read + authenticated write on the field-photos bucket
DROP POLICY IF EXISTS "field-photos read" ON storage.objects;
DROP POLICY IF EXISTS "field-photos insert" ON storage.objects;
DROP POLICY IF EXISTS "field-photos update" ON storage.objects;
DROP POLICY IF EXISTS "field-photos delete" ON storage.objects;

CREATE POLICY "field-photos read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'field-photos');
CREATE POLICY "field-photos insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'field-photos');
CREATE POLICY "field-photos update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'field-photos') WITH CHECK (bucket_id = 'field-photos');
CREATE POLICY "field-photos delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'field-photos');

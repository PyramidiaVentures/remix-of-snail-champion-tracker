CREATE TABLE public.benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('sgr','bfcr_dm')),
  low numeric NOT NULL,
  high numeric NOT NULL,
  species text NOT NULL DEFAULT '',
  diet text NOT NULL DEFAULT '',
  snail_weight_range text NOT NULL DEFAULT '',
  citation text NOT NULL DEFAULT '',
  url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (low <= high)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmarks TO authenticated;
GRANT ALL ON public.benchmarks TO service_role;
ALTER TABLE public.benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read benchmarks" ON public.benchmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write benchmarks" ON public.benchmarks FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.benchmarks (site_id, metric, low, high, species, diet, snail_weight_range, citation, url) VALUES
 (NULL,'sgr',0.92,0.96,'Achatina (Lissachatina) fulica','fresh leaves (bitter leaf, fluted pumpkin, pawpaw)','30–70 g','Amobi et al. 2019, Journal of Agriculture and Rural Development in the Tropics and Subtropics, June 2019','https://www.jarts.info/index.php/jarts/article/view/20190219195'),
 (NULL,'bfcr_dm',3.6,5.5,'Archachatina marginata','24% protein concentrate, dry matter basis','~90 g start','Omole, Sansi & Osayomi 2004, Livestock Research for Rural Development 16(12)','http://www.lrrd.org/lrrd16/12/omol16101.htm');
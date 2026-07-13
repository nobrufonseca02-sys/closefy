
-- Tag catalog
CREATE TABLE public.tag_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  bg_color text NOT NULL DEFAULT '#e5e7eb',
  text_color text NOT NULL DEFAULT '#111827',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_catalog TO anon, authenticated;
GRANT ALL ON public.tag_catalog TO service_role;
ALTER TABLE public.tag_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access tag_catalog" ON public.tag_catalog
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_tag_catalog_updated_at BEFORE UPDATE ON public.tag_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lead history
CREATE TABLE public.lead_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_history TO anon, authenticated;
GRANT ALL ON public.lead_history TO service_role;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access lead_history" ON public.lead_history
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX lead_history_lead_id_idx ON public.lead_history(lead_id, created_at DESC);

-- Seed catalog from existing lead tags (default palette)
INSERT INTO public.tag_catalog (name, bg_color, text_color)
SELECT DISTINCT tag, '#e5e7eb', '#111827'
FROM public.leads, UNNEST(tags) AS tag
WHERE tag IS NOT NULL AND tag <> ''
ON CONFLICT (name) DO NOTHING;

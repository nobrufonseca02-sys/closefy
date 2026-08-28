DROP POLICY IF EXISTS "Open access leads" ON public.leads;
CREATE POLICY "Authenticated access leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

DROP POLICY IF EXISTS "Open access feedbacks" ON public.lead_feedbacks;
CREATE POLICY "Authenticated access feedbacks" ON public.lead_feedbacks FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.lead_feedbacks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_feedbacks TO authenticated;

DROP POLICY IF EXISTS "Open access important_links" ON public.important_links;
CREATE POLICY "Authenticated access important_links" ON public.important_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.important_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.important_links TO authenticated;

DROP POLICY IF EXISTS "Open access sales" ON public.sales;
CREATE POLICY "Authenticated access sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sales FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;

DROP POLICY IF EXISTS "Open access tag_catalog" ON public.tag_catalog;
CREATE POLICY "Authenticated access tag_catalog" ON public.tag_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.tag_catalog FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_catalog TO authenticated;

DROP POLICY IF EXISTS "Open access lead_history" ON public.lead_history;
CREATE POLICY "Authenticated access lead_history" ON public.lead_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.lead_history FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_history TO authenticated;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS hipotese_dor TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS motivo_perda TEXT;
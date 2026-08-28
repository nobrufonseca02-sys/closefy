-- Security fix: the previous migrations granted full CRUD to the `anon` role
-- with fully open RLS policies (USING (true)). Combined with a public GitHub
-- repo containing the Supabase URL/anon key, this allowed anyone on the
-- internet to read/write/delete all leads, sales and feedbacks with no login.
-- This migration restricts every table to authenticated sessions only.
-- Single-user tool: no per-row ownership needed, just "must be logged in".

-- leads
DROP POLICY IF EXISTS "Open access leads" ON public.leads;
CREATE POLICY "Authenticated access leads" ON public.leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.leads FROM anon;

-- lead_feedbacks
DROP POLICY IF EXISTS "Open access feedbacks" ON public.lead_feedbacks;
CREATE POLICY "Authenticated access feedbacks" ON public.lead_feedbacks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.lead_feedbacks FROM anon;

-- important_links
DROP POLICY IF EXISTS "Open access important_links" ON public.important_links;
CREATE POLICY "Authenticated access important_links" ON public.important_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.important_links FROM anon;

-- sales
DROP POLICY IF EXISTS "Open access sales" ON public.sales;
CREATE POLICY "Authenticated access sales" ON public.sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sales FROM anon;

-- tag_catalog
DROP POLICY IF EXISTS "Open access tag_catalog" ON public.tag_catalog;
CREATE POLICY "Authenticated access tag_catalog" ON public.tag_catalog
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.tag_catalog FROM anon;

-- lead_history
DROP POLICY IF EXISTS "Open access lead_history" ON public.lead_history;
CREATE POLICY "Authenticated access lead_history" ON public.lead_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.lead_history FROM anon;

-- GTM alignment: register the dor hypothesis used per lead (Bloco 5) and the
-- loss reason when a lead reaches "venda_perdida" (Bloco 7 governance).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS hipotese_dor TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS motivo_perda TEXT;


CREATE TABLE public.important_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outro',
  description TEXT,
  client_name TEXT,
  company_name TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.important_links TO anon, authenticated;
GRANT ALL ON public.important_links TO service_role;
ALTER TABLE public.important_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access important_links" ON public.important_links FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_important_links_updated_at BEFORE UPDATE ON public.important_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sale_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'aguardando',
  sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_payment_date TIMESTAMPTZ,
  confirmed_payment_date TIMESTAMPTZ,
  payment_link TEXT,
  notes TEXT,
  owner TEXT,
  commission_rate NUMERIC(6,4) NOT NULL DEFAULT 0.01,
  commission_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Open access sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

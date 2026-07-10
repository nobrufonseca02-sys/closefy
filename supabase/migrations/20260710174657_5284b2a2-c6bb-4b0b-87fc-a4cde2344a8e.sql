
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_cliente TEXT NOT NULL,
  nome_empresa TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  cargo TEXT,
  faturamento_medio TEXT,
  numero_funcionarios TEXT,
  ticket_estimado NUMERIC DEFAULT 0,
  temperatura TEXT NOT NULL DEFAULT 'precisa_qualificacao',
  etapa_funil TEXT NOT NULL DEFAULT 'prospectando',
  origem TEXT,
  link_reuniao TEXT,
  data_proxima_reuniao TIMESTAMPTZ,
  data_followup TIMESTAMPTZ,
  observacoes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_feedbacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  data_reuniao TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumo TEXT,
  dor_principal TEXT,
  objecoes TEXT,
  nivel_urgencia TEXT,
  proximo_passo TEXT,
  percepcao_closer TEXT,
  link_gravacao TEXT,
  resultado_reuniao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_feedbacks TO anon, authenticated;
GRANT ALL ON public.lead_feedbacks TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_feedbacks ENABLE ROW LEVEL SECURITY;

-- MVP single-user tool: open policies. Add auth to restrict per-user access later.
CREATE POLICY "Open access leads" ON public.leads FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Open access feedbacks" ON public.lead_feedbacks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_feedbacks_updated_at BEFORE UPDATE ON public.lead_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bump lead ultima_atividade_em when feedback is inserted
CREATE OR REPLACE FUNCTION public.bump_lead_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.leads SET ultima_atividade_em = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER bump_activity_on_feedback AFTER INSERT ON public.lead_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.bump_lead_activity();

CREATE INDEX idx_leads_etapa ON public.leads(etapa_funil);
CREATE INDEX idx_feedbacks_lead ON public.lead_feedbacks(lead_id, data_reuniao DESC);

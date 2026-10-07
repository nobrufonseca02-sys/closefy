# Sincronização WhatsApp → Closefy

Worker dedicado ao número `+55 21 99417-7491`. Ele conecta o WhatsApp como um
aparelho vinculado e mantém as conversas individuais sincronizadas com a tabela
`leads` do Closefy.

## Comportamento

- No primeiro pareamento, solicita o histórico disponível ao WhatsApp e importa
  cada conversa individual como lead.
- Depois do pareamento, mensagens recebidas **e** enviadas criam ou atualizam o
  lead automaticamente.
- Grupos, canais, listas de transmissão, status e o próprio número são ignorados.
- O conteúdo das mensagens não é persistido. Somente nome, telefone, direção e
  horário da última atividade são usados pelo CRM.
- Telefone e JID são reconciliados pela função transacional
  `sync_whatsapp_lead`, evitando duplicidade em eventos simultâneos.
- Lead iniciado pela empresa entra em `prospectando`; ao receber mensagem do
  cliente, avança de `prospectando` para `conectado`. Etapas mais avançadas nunca
  são regredidas pela automação.

## Configuração inicial

1. Aplique a migration `20261007150000_whatsapp_lead_sync.sql` no projeto
   Supabase do Closefy.
2. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY`. Nunca exponha a service role no frontend.
3. Instale as dependências: `npm install` nesta pasta.
4. Rode `npm run pair` e digite no celular o código exibido em
   **WhatsApp > Aparelhos conectados > Conectar com número de telefone**.
5. Após o pareamento, mantenha `npm start` rodando em um serviço persistente com
   volume durável montado em `WHATSAPP_AUTH_STATE_DIR`.

O endpoint `GET /health` retorna 200 quando a conexão está ativa e informa o
progresso e os contadores da sincronização. O worker recusa qualquer conta
pareada que não corresponda a `5521994177491`.

## Validação local

```bash
npm test
npm run typecheck
```

O diretório `auth_state/` contém chaves privadas da sessão do WhatsApp. Ele está
ignorado pelo Git e precisa ser tratado como segredo no ambiente de produção.

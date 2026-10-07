# Sincronização WhatsApp → Closefy

Worker dedicado ao número `+55 21 99417-7491`. Ele conecta o WhatsApp como um
aparelho vinculado e mantém as conversas individuais sincronizadas com o inbox
e com a tabela `leads` do Closefy.

## Comportamento

- No primeiro pareamento, solicita o histórico disponível ao WhatsApp e importa
  as conversas e mensagens individuais para a aba **Conversas**.
- Depois do pareamento, mensagens recebidas **e** enviadas aparecem no inbox e
  criam ou atualizam o lead automaticamente.
- Mensagens escritas no Closefy entram em uma fila transacional e são enviadas
  pelo aparelho vinculado. Falhas ficam visíveis e podem ser reenviadas.
- Grupos, canais, listas de transmissão, status e o próprio número são ignorados.
- O conteúdo textual e as legendas são persistidos para compor o histórico do
  inbox. Mídias não são baixadas; áudio, imagem e documento aparecem como tipo
  de mensagem ou legenda.
- Telefone e JID são reconciliados pela função transacional
  `sync_whatsapp_lead`, evitando duplicidade em eventos simultâneos.
- Lead iniciado pela empresa entra em `prospectando`; ao receber mensagem do
  cliente, avança de `prospectando` para `conectado`. Etapas mais avançadas nunca
  são regredidas pela automação.

## Configuração inicial

1. Aplique, na ordem, as migrations `20261007150000_whatsapp_lead_sync.sql` e
   `20261007170000_whatsapp_inbox.sql` no Supabase do Closefy.
2. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY`. Nunca exponha a service role no frontend.
3. Instale as dependências: `npm install` nesta pasta.
4. Rode `npm run pair`. O terminal exibirá um código de oito caracteres.
5. No celular do número `+55 21 99417-7491`, abra **WhatsApp > Configurações >
   Aparelhos conectados > Conectar um aparelho > Conectar com número de
   telefone** e digite o código.
6. Aguarde o log `whatsapp_connected` e a sincronização do histórico. A aba
   **Conversas** mostrará o indicador **Conectado**.
7. Após o pareamento, mantenha `npm start` rodando em um serviço persistente com
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

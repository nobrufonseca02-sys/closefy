# Sincronização WhatsApp → Closefy

Worker dedicado ao número `+55 21 99417-7491`. Ele conecta o WhatsApp como um
aparelho vinculado e mantém as conversas individuais sincronizadas com o inbox
e com a tabela `leads` do Closefy.

Este modo não gera cobrança por mensagem da Cloud API, mas usa um protocolo de
aparelho vinculado que não é uma integração oficial da Meta. Por isso, não há
garantia de risco zero de restrição. O serviço reduz o risco operacional com
uma única sessão, trava de instância, reconexão reaproveitando credenciais e
deduplicação dos IDs de mensagem.

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
- Identificadores privados `LID` são resolvidos pelo mapa criptográfico enviado
  pelo celular antes da criação do cliente.
- Uma trava no diretório de autenticação impede duas instâncias locais de usar
  o mesmo número ao mesmo tempo.
- Lead iniciado pela empresa entra em `prospectando`; ao receber mensagem do
  cliente, avança de `prospectando` para `conectado`. Etapas mais avançadas nunca
  são regredidas pela automação.

## Configuração inicial

1. Aplique, na ordem, as migrations `20261007150000_whatsapp_lead_sync.sql` e
   `20261007170000_whatsapp_inbox.sql` no Supabase do Closefy.
2. Copie `.env.example` para `.env` e preencha `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY` e `WHATSAPP_INTEGRATION_TOKEN`. O token deve
   corresponder ao hash configurado pela migration do worker. Em projetos
   Supabase tradicionais, `SUPABASE_SERVICE_ROLE_KEY` continua disponível como
   alternativa e nunca deve ser exposta no frontend.
3. Instale as dependências: `npm install` nesta pasta.
4. Rode `npm run pair`. O terminal exibirá um código de oito caracteres.
5. No celular do número `+55 21 99417-7491`, abra **WhatsApp > Configurações >
   Aparelhos conectados > Conectar um aparelho > Conectar com número de
   telefone** e digite o código.
6. Aguarde o log `whatsapp_connected` e a sincronização do histórico. A aba
   **Conversas** mostrará o indicador **Conectado**.
7. Após o pareamento, mantenha o worker rodando em um serviço persistente com
   volume durável montado em `WHATSAPP_AUTH_STATE_DIR`. No Windows, use o PM2
   com o `ecosystem.config.cjs` desta pasta em vez de `pm2 start` solto, ele
   limita o número de reinícios automáticos (`max_restarts`) e usa backoff
   crescente, o que evita o worker reiniciar em loop infinito (janela de cmd
   piscando sem parar) se o PM2 perder o rastro do processo depois que o
   Windows volta da suspensão:
   ```
   pm2 start ecosystem.config.cjs
   pm2 save
   ```

Não execute `npm run pair` novamente enquanto o aparelho estiver vinculado. Em
reinícios normais, use `pm2 restart closefy-whatsapp`; ele reaproveita a sessão
existente.

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

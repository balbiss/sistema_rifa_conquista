# Conquista Campanhas — plataforma de campanhas e afiliados

Site público + painel administrativo + painel de afiliados + área do participante, integrados e com
atualização em tempo real. Campanha de demonstração: **Conquiste sua Habilitação A/B** (1.000
identificadores, 000–999), em **Rascunho — Aguardando Regularização**.

## Rodar local

```bash
bun install                       # dependências do front
cd server && bun src/index.ts     # API em http://localhost:3020 (cria data/campanhas.db + dados demo)
cd .. && npx vite                 # site/painéis em http://localhost:5199
```

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@teste.local | Admin123 |
| Afiliados | ana@ / bruno@ / carla@teste.local | Afiliado123 |
| Participante | participante@teste.local | Participante123 |

`SEED_DEMO=false` cria só a estrutura (sem dados de simulação). Produção: `APP_SECRET` obrigatório,
`STATIC_DIR=dist` para a API servir o front buildado, `CORS_ORIGINS`, `DB_PATH`, `UPLOAD_DIR`.

## Stack

- **API:** Bun + SQLite (`bun:sqlite`, WAL), sem dependências externas. Token HMAC próprio, senhas bcrypt.
- **Front:** React 19 + Vite + react-router + chart.js + SweetAlert2.
- **Tempo real:** Server-Sent Events (`/api/events`) — só manda *o que mudou*; cada tela busca de novo
  o que tem permissão de ver.
- **Visual:** painéis com o layout do CRM Clara V2 (sidebar, cabeçalhos, tabelas, modais) nas cores
  da marca (azul-marinho `#0B1730`, azul `#1458D4`, laranja `#FF8A24`). Site público em `src/pub.css`.

## Trava jurídica (o mais importante)

Nada real acontece sem regularização. `legalGate()` em `server/src/services.ts` exige **todos**:
trava geral liberada (Configurações › Regularização), modalidade `autorizada`, nº de autorização e
documento de autorização anexado. Pagamento real exige ainda meio de pagamento homologado (não
configurado nesta instalação). Enquanto isso:

- participações, comissões e apurações só em **modo simulação** (marcadas `simulated=1`);
- o progresso público conta **só participações reais** (simulação nunca aparece como real);
- prêmio em dinheiro só aparece no site com validação jurídica + campanha regularizada;
- a campanha não pode ir para "Autorizada"/"Ativa"; apuração oficial bloqueada.

## Regras implementadas

- **Identificadores:** grade com Disponível/Reservado/Atribuído/Cancelado/Bloqueado + histórico por número.
  Atribuição em transação `IMMEDIATE` com `UPDATE … WHERE status='disponivel'` (sem duplicidade nem corrida).
- **Comissão:** gerada na confirmação, `UNIQUE(participation_id)` → uma única vez por evento.
  Cancelar participação → comissão cancelada (ou estornada, se já paga) e números liberados.
  Valor = comissão própria do afiliado ou da campanha (R$ 2,50 na demo).
- **Progresso:** calculado na hora (`progress()`), nunca passa de 100%.
- **Apuração:** 3 últimos dígitos do 1º prêmio da Loteria Federal (48273 → 273). Consulta automática ao
  portal da CAIXA (origem validada no servidor) ou registro manual com fonte. Registros **imutáveis**
  (triggers no banco) e encadeados por SHA-256 — `verifyDrawChain()` detecta qualquer adulteração.
- **Privacidade:** afiliado só acessa os próprios dados, com nome/telefone de indicados mascarados.
- **Auditoria:** tabela imutável com toda ação importante.
- **Segurança:** bloqueio após tentativas erradas, limite de requisições, troca de senha derruba
  sessões, permissões por módulo para administradores.

## Testes

```bash
cd server && bun test                                   # 19 testes de regra de negócio/segurança
node scripts/resp.cjs <saida> [paginas]                 # responsividade (prints + estouro horizontal)
#   PLAYWRIGHT_CORE=<caminho do playwright-core>  LOGIN=email:senha  WIDTHS=1440,1024,390
```

## Estrutura

```
server/src/  db.ts (schema) · services.ts (regras) · auth.ts · settings.ts · events.ts (SSE)
             routes/public.ts · routes/admin.ts · routes/affiliate.ts · seed.ts
src/         pages/publico (site) · pages/admin · pages/afiliado · components · pub.css · index.css
public/hero/ recortes das imagens de referência (banner e prêmio)
```

## Pagamento PIX (SyncPay)

- Compra rápida no site: quantidade + **nome, CPF e WhatsApp** (sem criar conta; dados lembrados no
  aparelho; quem já comprou com o mesmo WhatsApp é reaproveitado). PIX com botão "Copiar código",
  QR opcional, contagem regressiva e confirmação automática. Consulta em **/meus-numeros** (WhatsApp + CPF).
- Fluxo: reserva os números → cobrança `cash-in` na SyncPay → confirmação só depois de **consultar**
  a SyncPay (`completed` + valor exato) → participação confirmada, comissão gerada, progresso sobe.
  PIX vencido (padrão 15 min) libera os números; pago após vencer / valor divergente vira alerta no painel.
- Configuração: Configurações › Pagamentos (PIX) — Client ID/secret (secret nunca volta ao navegador),
  token do webhook, URL `https://SEU-SITE/api/webhooks/syncpay`. Variáveis de ambiente têm prioridade:
  `SYNCPAY_CLIENT_ID`, `SYNCPAY_CLIENT_SECRET`, `SYNCPAY_WEBHOOK_TOKEN`, `SYNCPAY_MODO`.
- **Venda ao público só abre** com: campanha regularizada (trava jurídica) + status Ativa + PIX em modo real.
- Modo **simulado** (teste local, bloqueado em produção): botão "Testar compra PIX" na tela da campanha.

## Saques de afiliados

- Saldo = comissões **aprovadas** ainda não sacadas. Pedido mínimo R$ 55, taxa R$ 5 (afiliado recebe o resto),
  um saque aberto por vez, chave PIX cadastrada pelo afiliado (travada durante o saque; troca avisa o admin).
- Prazo: pedidos até 16h → pagos até 18h do mesmo dia; depois → até 18h do dia seguinte (Brasília). Tudo
  configurável em Configurações › Saques.
- Admin paga **manualmente** em Saques (copiar chave, registrar ID do PIX/comprovante) ou recusa com motivo
  (saldo volta). Atrasados aparecem destacados.
- Teste no navegador: `node scripts/e2e-pix-saque.cjs <pasta>` (compra em modo teste + saque + pagamento).

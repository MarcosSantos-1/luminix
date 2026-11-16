# ADR-029 — Conta do cliente, vínculo com a clínica e agendamento pelo cliente

Status: Accepted (implementado: migration 0034, rotas `/client/*`, área web e app)

Data: 2026-11-16

## Contexto

A área do cliente (web `/cliente` e app Expo) guardava conta, ficha e horários só no aparelho.
Agendamentos não chegavam à clínica e a conta criada no site não existia no app.

## Decisão

- **Identidade:** Firebase e-mail/senha no mesmo projeto Luminix (ADR-027). A API resolve o uid em
  `identities` como faz com a equipe; uma pessoa pode ser equipe e cliente.
- **Perfil global:** `client_profiles` passa a guardar nome, e-mail, celular, ficha nível I
  (`anamnesis`) e a foto (`photo_data`). Sem CPF.
- **Vínculo:** entrar em um espaço publicado cria uma ficha local nova em `clinic_clients`
  (`source = client_app`, `client_profile_id` preenchido). Nunca associa a cadastros feitos na
  recepção por telefone, e-mail ou CPF. `anamnesis_shared` registra a permissão para o espaço usar a
  ficha da conta; sem ela, a ficha própria fica em `client_anamnesis`. Remover o espaço só marca
  `client_removed_at`; a clínica mantém cadastro e histórico.
- **Agendamento:** `POST /client/spaces/:slug/appointments` grava em `appointments` com
  `booking_source = client`. Serviço `instant` entra confirmado; `request` entra como `scheduled`
  (a confirmar). `manual_release` não é oferecido ao cliente.
- **Profissionais:** a API lista quem faz o serviço (`professional_services`; serviço sem vínculos
  aceita toda a equipe ativa), respeitando o público da profissional e do vínculo pelo sexo
  informado. Com 0 ou 1 profissional não há escolha; com mais, a pessoa escolhe ou deixa "sem
  preferência" e a API usa a primeira livre.
- **Horários livres:** expediente da clínica (ou exceção do dia) estreitado pela semana da
  profissional, passo de 30 min, antecedência mínima e janela de `booking_policies`, sem
  sobreposição com horários ativos daquela agenda. A função SQL repete as garantias finais
  (dono da ficha, catálogo, futuro, conflito) com trava por agenda.
- **Cancelar/remarcar:** só o próprio horário, respeitando `allow_client_cancellation` e os prazos.
- **Acesso:** web e app chamam a API direto com Bearer token; CORS só em `/client/*` e só para as
  origens do site e do app. Limite próprio de 120 requisições/min por IP.
- **Pagamento:** Pix/cartão continuam simulados; o método fica em `client_payment_method` e nenhum
  lançamento financeiro é criado.

## Alternativas consideradas

- Proxy no `apps/web` como no admin: todas as clientes sairiam do mesmo IP da Vercel e o limite
  por IP bloquearia todo mundo junto.
- Notificações em tabela própria: adiado. Os avisos são derivados dos horários (confirmação,
  remarcação, cancelamento, lembrete de 48 h); o "lido" fica no aparelho.

## Consequências

- O gestor vê os agendamentos do app na agenda atual, sem mudança no admin.
- A ficha nível I ainda não aparece na ficha do cliente no admin.
- Regras de tipo/mapper existem duplicadas em `apps/web/lib/client-app/store.ts` e
  `apps/mobile-client/src/store.tsx` (TD-012).

## Quando revisar

Ao criar push real, pagamento online, fichas nível II–III ou ao mover regras comuns para
`packages/contracts`.

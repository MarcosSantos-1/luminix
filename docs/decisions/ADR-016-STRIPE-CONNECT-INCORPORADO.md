# ADR-016 — Stripe Connect incorporado à clínica

Status: Accepted

Data: 2026-10-22

## Decisão e escopo

O step Pagamentos permite receber fora do app ou configurar uma conta Stripe dentro do admin.
A mesma integração está disponível no Financeiro para retomar o cadastro, atualizar dados bancários
e acessar componentes de pagamentos/reembolsos/disputas e repasses. A clínica pode ser criada sem
Stripe ao escolher recebimento externo. Com “Pagamentos no app”, o avanço exige conta habilitada,
conforme a evolução de 2026-10-23 abaixo. Escolher recebimento externo não cria nem exclui uma conta;
continua normalizando pacotes para `clinic_only` no rascunho.

Esta decisão substitui a pendência de modelo Connect da ADR-002 e a descrição do cadastro Stripe
como não implementado da ADR-013. O checkout do cliente final, assinaturas de clientes, venda de
pacotes e conciliação financeira permanecem entregas seguintes. Não marcar uma preferência de
pagamento como prova de conta habilitada.

Usamos Accounts v2 (`stripe.v2.core.accounts`) para criar e consultar contas. A conta da plataforma
recusou criação Accounts v1 no teste real; não habilitamos compatibilidade antiga. Account Sessions
continua usando a API interoperável `accountSessions` para os componentes incorporados.

Configuração adotada: Brasil, BRL, `pt-BR`, `merchant`, `card_payments` solicitado,
`dashboard=full`, `fees_collector=stripe` e `losses_collector=stripe`. A direção para os pagamentos
futuros é direct charges na conta da clínica, sem application fee do Luminix nesta fase. Taxas,
reembolsos e disputas afetam o saldo da clínica segundo as regras Stripe; isso não significa que
chargebacks sejam perdoados nem que repasses sejam imediatos. A responsabilidade da plataforma
por seu próprio saldo permanece. A clínica mantém acesso ao dashboard Stripe como alternativa.

O formulário incorporado pode abrir autenticação obrigatória em janela Stripe. Não coletamos nem
armazenamos documentos KYC, dados bancários, PAN ou senhas no Luminix. Os SDKs oficiais
`@stripe/connect-js` e `@stripe/react-connect-js` carregam a UI e fornecem tipos/integração React;
implementar o formulário financeiro manualmente duplicaria responsabilidade e manutenção.

## Segurança e persistência

Migration 0016 cria `stripe_connect_accounts`, independente de `payment_preferences`, pois o
vínculo precisa existir antes da conclusão do onboarding. Chave por clínica, plataforma Stripe e
modo; account ID único. RLS forçada, tenant imutável, auditoria existente e escrita somente por
funções SECURITY DEFINER com search_path fixo, autorização e EXECUTE restritos.

As rotas exigem token Firebase verificado e `settings:manage`, inclusive para abrir componentes
financeiros. Essa permissão abrange a gestão financeira nesta fase; antes de delegar administração
não financeira a funcionários, separar uma permissão financeira explícita. Nunca aceitar account ID,
clinic ID autorizado, permission ou status financeiro do body. Revalidar membership/grant após
chamadas externas e antes de devolver a sessão. Sessões já emitidas continuam sujeitas ao prazo da
Stripe; a remoção de um vínculo impede novas sessões, mas não revoga retroativamente uma sessão
Stripe emitida. Tratar esse limite antes da abertura a funcionários com acesso financeiro.

Reservamos uma chave de criação durável em transação curta e usamos idempotência Stripe com corpo
estável. Chamadas externas acontecem fora de transações SQL. Falha de rede/commit permite repetir
a mesma chave; após 23 horas sem vínculo confirmado, a API exige reconciliação operacional e não
cria outra conta automaticamente. Recuperação: localizar a conta na plataforma/modo corretos pela
metadata `luminix_clinic_id`, conferir os logs Stripe da criação e vincular usando a função restrita,
a reserva original e o contexto autorizado. Não apagar reservas para tentar novamente.

Account Session habilita somente o componente solicitado por enum fechado. Não persistir ou logar
client secrets. Respostas no-store, payload limitado, erros sanitizados e rate limit por identidade/
clínica (15/minuto), além da proteção de autenticação existente. Status é consultado na Stripe a
cada abertura/atualização; habilitado exige card payments e payouts ativos, conta não encerrada.
Falha da consulta não reutiliza status antigo como autorização. Nenhum webhook/cobrança automatizada
é ativado nesta entrega; antes de cobrar, implementar eventos assinados e idempotentes, conciliação
e verificação das capabilities no backend da cobrança.

## Operação e rollback

Somente `sk_test_` + `pk_test_` são aceitas, inclusive no deploy Production. A chave pública é
fornecida pela API junto da sessão; a secret key permanece na API. Chaves devem pertencer à mesma
plataforma/modo. `STRIPE_PUBLISHABLE_KEY` é necessária no Fly além da chave secreta. Não é necessário
rebuild com chave nova no admin. Status financeiro não é escrito no campo legado `provider_status`,
que não deve ser usado como fonte de autorização.

A migration cria uma tabela vazia, duas funções, constraints, RLS e triggers. Não reescreve linhas
existentes; locks DDL breves, compatível com a aplicação anterior. Validar com PGlite e role restrita
antes do Neon principal autorizado. Reverter aplicação preserva vínculos e chaves de idempotência;
se houver necessidade de remover schema, criar migration corretiva após conciliar contas Stripe,
nunca editar migration aplicada ou apagar registros para reiniciar cadastro.

Validação reproduzível: `pnpm --filter @luminix/api exec vitest run tests/stripe-connect.test.ts`.
Teste real isolado: `pnpm --filter @luminix/api exec tsx scripts/check-stripe-connect.ts
--allow-test-account`, confere plataforma e modo, cria conta sintética e encerra no finally. Não
substitui teste manual do formulário, autenticação popup e verificação KYC.

## Assinatura do Luminix — direção, ainda não implementada

Fluxo separado clínica → Luminix. Não criar subscription, cobrança ou bloqueio na configuração
Connect. Regras solicitadas: 10 dias gratuitos, R$ 100 via Pix ou R$ 119,99 no cartão, possibilidade
de pagamento antecipado, promessa de pagamento por mais 10 dias e bloqueio após 30 dias sem pagar.
Ainda definir marco inicial, fórmula do vencimento do pagamento antecipado, relação entre carência/
promessa/limite de 30 dias e se o bloqueio atinge portal cliente ou gestão da clínica. Implementar
futuramente um domínio de billing separado, sem reaproveitar o saldo recebido dos pacientes como
pagamento da assinatura e sem bloquear cadastros nesta fase.

## Referências

- [Accounts v2](https://docs.stripe.com/connect/accounts-v2/account-creation)
- [Modelo SaaS](https://docs.stripe.com/connect/saas)
- [Responsabilidades](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- [Onboarding incorporado](https://docs.stripe.com/connect/saas/tasks/onboard)

### Validação operacional — 2026-10-22

Migration 0016 aplicada e verificada no endpoint direto
`ep-bitter-fog-acchavo1.sa-east-1.aws.neon.tech/neondb`, com 18 clínicas e uma preferência de
pagamento existentes antes da aplicação; nenhum desses registros foi reescrito. Verificação
transacional de RLS/FK/auditoria passou e reverteu fixtures. Stripe test na plataforma
`acct_1UBfvrCz54koiZqR` criou conta v2 e sessões dos quatro componentes; as duas contas sintéticas
criadas na validação foram encerradas. Encerramento v2 exige `applied_configurations=['merchant']`.
Não houve cobrança nem repasse. Testes automatizados validaram autorização, retry, expiração de
reserva, auditoria e revogação durante emissão de sessão. TypeScript/builds passaram; limitações
de validação agregada preexistentes estão na TD-007.

### Orientação de acesso e apresentação — 2026-10-23

O painel explica Connect em três etapas, distingue cadastro de teste do checkout ainda pendente
e oferece orientações expansíveis de acesso. O login Luminix não cria uma senha Stripe.
A ajuda distingue confirmação por SMS de aplicativo autenticador sem publicar códigos universais,
com instruções simples para adicionar o QR code, usar o código temporário e guardar a recuperação.
O usuário confirmou a resolução do acesso com autenticador; não desabilitamos autenticação nem
alteramos responsabilidades da plataforma para contornar esse fluxo.

Ao abrir um componente Stripe, ele substitui o conteúdo do card de situação e usa toda sua
largura; fechar retorna ao resumo e consulta novamente o status. O botão de atualização tem
fundo azul opaco e texto claro. Permissões, isolamento por clínica e schema permanecem iguais.
O usuário confirmou a conclusão da autenticação. Validação automatizada de build e testes
não substitui a conferência manual do formulário, 2FA e KYC de cada conta.

### Bloqueio condicional e feedback — 2026-10-23

“Pagamentos no app” exige status Stripe ativo, pagamentos e repasses habilitados e zero
requisitos atualmente devidos/vencidos antes de avançar da etapa Pagamentos. A interface bloqueia
a ação durante consulta, abertura e edição do formulário, apresenta o motivo junto dos controles
e oferece “Receber fora do app” inclusive no formulário aberto. Esse caminho permite seguir sem
Stripe e mantém pacotes limitados ao recebimento na clínica. Retomar Stripe no Financeiro continua
possível. Conta pronta em teste não significa checkout cliente implementado ou dinheiro real.

A API reconsulta Stripe no avanço para regras/revisão (inclusive formato legado) e na conclusão,
usando o vínculo da clínica autorizada, plataforma e modo configurados no servidor. Não confia
em readiness, account ID ou status do frontend. Falha externa impede o avanço em modo no app,
sem impedir o caminho externo. Chamadas externas acontecem entre transações curtas; a escrita
revalida acesso e versão do rascunho. Conclusões já aplicadas continuam idempotentes sem depender
do status posterior Stripe. Não há alteração de schema ou nova migration.

Feedback inclui cards com ícones, texto e cores para pagamentos/repasses, aviso de pendências,
links destacados, instruções de autenticação separadas, tooltips acessíveis, carregamento e toasts
de consulta, abertura, erros e troca de modo. Animações respeitam redução de movimento.

Teste de regressão em `tests/onboarding.test.ts`: vínculo ausente, conta pendente, pagamentos ou
repasses não liberados, requisitos devidos, indisponibilidade Stripe, isolamento entre clínicas,
reconsulta na conclusão, alternativa externa e replay após conclusão. Consulta antes de cada
escrita acrescenta latência de rede somente ao caminho no app; não há polling automático.

### Análise interna sem pedido de dados — 2026-10-24

Uma conta de teste pode ficar com pagamentos e repasses pendentes mesmo depois do formulário
não pedir mais nada. A Stripe classifica a declaração de exposição política como revisão dela
(`awaiting_action_from=stripe`, `requirements_pending_verification`, `no_resolution`). No modo
teste essa revisão não conclui, e a plataforma não tem permissão para preencher o campo depois
do onboarding incorporado. O prazo v2 aparece como `past_due`, embora a API v1 liste o campo só
em `pending_verification` e não em `currently_due`.

Requisito que aguarda a Stripe não conta como dado que a clínica precisa enviar. Se essa for a
única pendência e as capacidades estiverem apenas em análise, o estado é `reviewing`. Como só
existem chaves de teste, esse estado libera o avanço do cadastro. Os indicadores de pagamento e
repasse continuam desligados, e o mesmo estado com `testMode=false` não libera. Conta restrita,
requisito do usuário ou capacidade inativa por outro motivo continua bloqueando.

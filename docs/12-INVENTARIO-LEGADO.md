# Inventário inicial — Charme & Bela

Data: 2026-09-10. Status: levantamento estático inicial concluído; nenhuma funcionalidade migrada ou validada em execução.

Atualização de produto posterior: [PR01–PR20](13-REQUISITOS-PENDENTES-DO-PRODUTO.md) e [ADR-002](decisions/ADR-002-DIRECOES-DO-PRODUTO.md) definem R2, Stripe Connect sem Asaas, autenticação distinta e novas configurações. As propostas preliminares abaixo registram a análise do legado e devem ser interpretadas à luz dessas decisões.

## Escopo e evidência

Fonte: `legacy/charme-bela/`. HEAD observado: `90429e73437131754d2c52a1740ae9882611f8a4`. O worktree já apresentava alteração em `backend/scripts/fly-migrate.sh`; a análise desse script considera a cópia local, não apenas o commit. O legado não foi modificado.

Foram examinados manifests, schema, declarações de rotas, fluxos selecionados de autorização, pagamento, agenda, configurações, navegação e operações. Não foram executados builds, testes, scripts, seeds, migrations, chamadas de API ou consultas ao banco. Arquivos de ambiente reais foram identificados pelo nome, sem leitura dos valores. O histórico completo não foi auditado para secrets.

**Existente** significa que há código correspondente; não significa funcionalidade comprovada em produção. **Parcial/simulado** identifica implementação incompleta observada. **Proposta** indica destino recomendado, ainda sujeito ao desenho detalhado. Ausência de evidência não prova ausência em serviços externos.

Consulte o [mapa técnico](migration/LEGADO-MAPA-TECNICO.md) para endpoints, modelos, páginas e migrations com caminhos exatos. Os caminhos abreviados abaixo são relativos a `legacy/charme-bela/`.

## Resumo da base

| Item                   | Observado                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Aplicações             | Backend, web e mobile; manifests e locks npm próprios, sem workspace na raiz do legado                   |
| Arquivos no índice Git | 380; não equivalem ao total de arquivos locais/ignorados                                                 |
| API                    | 16 arquivos de rotas; 122 declarações diretas de handlers Fastify                                        |
| Banco                  | 20 modelos Prisma; 26 arquivos de migration SQL                                                          |
| Web                    | 32 arquivos `page.tsx`, reunindo público, cliente e administração                                        |
| Mobile                 | Aplicativo do cliente, com navegação de autenticação/onboarding e área autenticada                       |
| Testes/CI              | Nenhuma suíte por nomes convencionais ou workflow CI localizado no índice; manifests sem script de teste |
| Multi-tenancy          | Nenhum modelo Clinic, membership ou profissional no schema; sem campo de tenant                          |

Versões declaradas, não versões instaladas verificadas: backend Fastify `^5.6.1`, Prisma `^6.17.1`, TypeScript `^5.9.3`; web Next `^15.5.18`, React `19.1.0`, Tailwind `^4.1.14`, Firebase `^12.4.0`; mobile Expo `~54.0.35`, React Native `0.81.5`, NativeWind `^4.2.1`, Firebase `^12.15.0`.

## Inventário funcional e destino proposto

Todos os itens existentes abaixo estão apenas inventariados; nenhum deve ser marcado como migrado.

| ID / capacidade                                                                    | Evidência principal                                                                                                                  | Comportamento a preservar ou decidir                                                                     | Destino e estratégia preliminar                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| F01 Identidade do cliente — existente                                              | `web/contexts/AuthContext.tsx`; `mobile/src/contexts/AuthContext.tsx`; `backend/src/utils/auth.ts`                                   | Firebase, sincronização de usuário, email/Google/Apple no código; testar cada provedor depois            | Identidade global e vínculos locais separados; reavaliar integração sem copiar sessão administrativa     |
| F02 Administração/autorização — parcial                                            | `web/app/admin-login/page.tsx`; `web/app/admin/acessos/page.tsx`; `backend/src/utils/auth.ts`                                        | Admin web simulado; tela de acessos com mock; helpers de backend existem, mas uso é desigual             | Reimplementar autenticação administrativa e política por clínica antes de portar operações               |
| F03 Clientes/perfil/aniversários — existente                                       | `backend/src/routes/users.ts`; `web/app/admin/clientes/page.tsx`; `mobile/src/screens/client/ProfileScreen.tsx`                      | Cadastro administrativo ou via Firebase, perfil, estado ativo e aniversários                             | `clients` e `auth`; distinguir identidade, vínculo, cadastro local e pagador                             |
| F04 Serviços — existente                                                           | `backend/src/routes/services.ts`; `web/app/admin/servicos/page.tsx`; `mobile/src/screens/client/ServicesScreen.tsx`                  | Catálogo, preço, duração, categorias, elegibilidade em plano e serviços ligados a máquinas               | `services`; adaptar catálogo por clínica; categorias rígidas precisam de decisão de produto              |
| F05 Agenda/disponibilidade — existente                                             | `backend/src/routes/schedule.ts`; `utils/scheduleValidation.ts`; `utils/scheduleHours.ts`                                            | Grade dinâmica, capacidade simultânea, semana, feriados/exceções e prévia de clientes afetados           | `appointments` e disponibilidade de profissionais; rever modelo global e convenção temporal              |
| F06 Agendamentos — existente                                                       | `backend/src/routes/appointments.ts`; `web/components/admin/NovoAgendamentoModal.tsx`; `mobile/src/screens/client/BookingScreen.tsx` | Criar, confirmar, concluir, cancelar, reagendar, hold, crédito/estorno e histórico                       | Adaptar por fluxo; preservar invariantes e testar concorrência, propriedade e transições                 |
| F07 Planos e assinaturas da clínica — existente                                    | `routes/plans.ts`; `routes/subscriptions.ts`; `utils/planUsage.ts`; `utils/planChange.ts`                                            | Bronze/Prata/Ouro, serviços elegíveis, limites, mudança pendente, pausa, cancelamento e atraso           | Domínio de planos/recorrência da clínica; não confundir com assinatura B2B do Luminix                    |
| F08 Pacotes — existente                                                            | `routes/packages.ts`; modelos `PackageItem`, `PackagePurchase`; `mobile/src/screens/client/PackageTimelineScreen.tsx`                | Composição, compra, snapshot de itens, sessões e estorno                                                 | `packages` como domínio dentro da API, não como biblioteca do monorepo; adaptar saldo e integridade      |
| F09 Vouchers/créditos — existente                                                  | `routes/vouchers.ts`; `utils/vouchers.ts`; `utils/settlement.ts`                                                                     | Desconto, tratamento/mês grátis, crédito remanescente, união, uso e expiração                            | Adaptar para clínica e origem auditável; verificar consumo concorrente e compensações                    |
| F10 Anamnese — existente, autorização bloqueadora                                  | `routes/anamnesis.ts`; `utils/anamnesisSchema.ts`; `web/lib/adapters/`; `mobile/src/screens/anamnesis/AnamnesisFlow.tsx`             | JSON em versões 1/2, consentimento, normalização de datas e alertas na agenda                            | `anamnesis`; preservar dados/versão, separar por clínica e proteger acesso antes de portar               |
| F11 Pagamentos — existente                                                         | `routes/payments.ts`; `lib/asaas.ts`; `utils/paymentHolds.ts`; `utils/subscriptionDunning.ts`                                        | Pix, checkout hospedado, cartões tokenizados, assinatura, histórico, estorno, chargeback e inadimplência | Separar regra de negócio do provedor; decisão Asaas/Stripe pendente por fluxo financeiro                 |
| F12 Configurações/comercial — existente                                            | `routes/config.ts`; `web/app/admin/configuracoes/page.tsx`                                                                           | Config pública, confirmação de alterações, sincronização de preço Asaas, transação e notificações        | `clinics`/configurações e planos; separar projeção pública da configuração administrativa                |
| F13 Notificações — existente                                                       | `routes/notifications.ts`; `utils/notifications.ts`; `utils/expoPush.ts`                                                             | Caixa de entrada, leitura, limpeza, mensagens comerciais e Expo push                                     | Adaptar destinatários por vínculo/dispositivo e clínica; push complementar à persistência                |
| F14 Público/landing/depoimentos — existente                                        | `web/app/page.tsx`; `web/app/servicos/page.tsx`; `routes/testimonials.ts`                                                            | Conteúdo institucional da clínica, catálogo e depoimentos                                                | `apps/web`; distinguir marca Luminix de conteúdo e publicação de cada clínica                            |
| F15 Banners/promoções — existente                                                  | `routes/banners.ts`; `web/app/admin/promocoes/page.tsx`; `mobile/src/components/HomePromoCarousel.tsx`                               | Ordenação, local LANDING/CLIENT, imagem, link e associação a máquina                                     | Conteúdo público da clínica; não equivale a motor de campanhas/IA                                        |
| F16 Máquinas alugadas — existente, migrations incompletas no conjunto inspecionado | `routes/machineRentals.ts`; `utils/machineRental.ts`; `web/components/admin/MachineRentalsSection.tsx`                               | Laser/crio, ocorrência mensal, liberação, banner, cancelamento e regras próprias                         | Capacidade específica a decidir após agenda/profissionais; não generalizar sem necessidade               |
| F17 Dashboard e atividades — existente                                             | `web/app/admin/page.tsx`; `web/lib/api.ts`; `web/app/admin/atividades/page.tsx`                                                      | Contagem de clientes, agenda, receita, assinaturas e atividades derivadas de notificações                | Relatórios da clínica; definir métricas e projeções. Atividades não são trilha de auditoria independente |
| F18 Mobile cliente — existente                                                     | `mobile/src/navigation/RootNavigator.tsx`, `ClientNavigator.tsx`                                                                     | Onboarding, autenticação, anamnese, plano, agenda, checkout e perfil                                     | `apps/mobile-client`; adaptar contratos e seleção de clínica, sem portar marca automaticamente           |
| F19 Operação automática — existente                                                | `backend/src/utils/cron.ts`                                                                                                          | Manutenção ao iniciar processo e timers opcionais: holds, meses grátis, atraso, vouchers e máquinas      | Planejar execução confiável/idempotente; worker separado apenas se necessário                            |

## Capacidades do Luminix sem equivalente completo localizado

- Clínica/tenant e onboarding do estabelecimento; troca de clínica e memberships.
- Profissionais como entidades e agenda por profissional; MANAGER no legado não substitui esse modelo.
- Autorização por clínica e administração real de equipe; STAFF aparece na UI mock, não no enum Role do banco.
- Assinatura B2B da clínica para usar o Luminix; planos existentes vendem tratamentos ao cliente final.
- App mobile da gestora.
- Storage privado de mídia com propriedade por clínica e upload/download autorizado; os arquivos atuais usam imagens estáticas, URLs e data URLs.
- Motor de campanhas/IA, afiliados, indicações e analytics corporativo multi-produto.

O painel da empresa-mãe será externo e poderá consolidar Luminix, Kota e outros produtos, conforme esclarecimento do usuário. Não confundir o dashboard atual da clínica com esse painel. A ADR-002 posteriormente consolidou essa fronteira externa; os mapas ativos foram sincronizados.

## Banco: propriedade e transformações necessárias

Fonte de verdade local: [schema.prisma](../legacy/charme-bela/backend/prisma/schema.prisma). Banco remoto e histórico aplicado não foram consultados.

| Modelos atuais                                     | Propriedade observada                                         | Mudança necessária para desenhar o multi-tenant                                                              |
| -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `User`                                             | Identidade, papel, cadastro, pagador e preferências unidos    | Separar identidade global de vínculo e dados da clínica; não duplicar automaticamente identidade por clínica |
| `SavedCard`                                        | Token do Asaas vinculado ao usuário                           | Definir escopo do provedor/conta recebedora; não assumir portabilidade entre contas ou gateways              |
| `Service`, `SubscriptionPlan`, `PackageItem`       | Catálogo único                                                | Propriedade da clínica e relacionamentos sem referência cruzada                                              |
| `Subscription`, `MonthlyUsage`                     | Uma assinatura por usuário; consumo único por usuário/mês/ano | Escopo por vínculo/contrato da clínica; regra de quantidade de assinaturas ainda a decidir                   |
| `Appointment`                                      | Usuário e serviço, sem clínica/profissional                   | Tenant, profissional/recurso, integridade e representação temporal explícitos                                |
| `PackagePurchase`, `Voucher`                       | Direitos financeiros ligados ao usuário                       | Clínica proprietária, consumo e origem; preservar saldos e snapshots                                         |
| `AnamnesisForm`                                    | Um formulário por usuário (`userId @unique`)                  | Formulário da clínica/vínculo; decidir histórico e versionamento sem compartilhar dados clínicos             |
| `ManagerSchedule`, `ScheduleOverride`              | Únicos por dia da semana/data globalmente                     | Clínica e eventualmente profissional/recurso; rever constraints                                              |
| `Testimonial`, `Banner`, `SystemConfig`            | Publicação e configuração globais                             | Separar por clínica e projeção pública; contato/marca não são configuração global do SaaS                    |
| `MachineRentalSettings`, `MachineRentalOccurrence` | Únicos por tipo e tipo/ano/mês                                | Escopo de clínica; decidir se regras LASER/CRYO são configuráveis ou específicas                             |
| `Notification`                                     | `userId` opcional; null representa admin                      | Destinatário e clínica explícitos; null não pode significar todos os administradores de todos os tenants     |
| `ProcessedWebhookEvent`                            | ID composto em código, source Asaas                           | Definir escopo do provedor/conta e processamento concorrente idempotente                                     |

Outros cuidados de dados:

- IDs atuais usam `cuid()`. Não converter indiscriminadamente para UUID: desenhar preservação ou tabela de correspondência de IDs e referências externas.
- Valores monetários usam `Float`. Definir representação exata e arredondamento no destino antes da importação.
- Relações de `User` incluem exclusão em cascata. Exclusão de identidade e remoção de vínculo exigem tratamentos distintos.
- `SubscriptionPlan.tier` tem índice, não unicidade. `PUT /config` verifica exatamente um plano de cada tier no código. Avaliar invariante na modelagem nova.
- `Voucher.serviceId`, `planId` e `grantedBy` são strings sem relações Prisma correspondentes nesse modelo; mapear referências e órfãos em ensaio de dados.
- Não alterar dados antes de conhecer volumes, vínculos reais, consentimentos, saldos e estados externos de pagamento.

## Integrações e execução

| Integração        | Evidência e situação                                                                         | Implicação                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PostgreSQL/Prisma | `prisma/schema.prisma`, `src/lib/prisma.ts`; conexão inicia ao importar módulo               | Não importar backend em ferramentas de inventário; conexão real não validada                   |
| Firebase Auth     | Contextos web/mobile e JWT verificado com `jose` no backend                                  | Separar autenticação de autorização; projeto legado possui fallback fixo no código             |
| Asaas             | Adapter HTTP, rotas e webhook; sandbox como URL padrão do adapter, chave via ambiente        | Uma conta configurada globalmente; credenciais e despacho por clínica precisam de desenho      |
| Stripe            | Campos/comentários legados e configuração Render                                             | Não é o gateway ativo evidenciado; não inferir integração pronta pela presença de campos       |
| Expo push         | Envio HTTP em `utils/expoPush.ts`; token em User                                             | Um token atual por usuário; rever múltiplos dispositivos e preferências por clínica            |
| Email/SMS         | Flags em SystemConfig; email de autenticação no Firebase; operações de notificações do Asaas | Não foi localizado serviço genérico próprio de envio de email/SMS; flags não comprovam entrega |
| Fly.io            | `fly.toml`, Dockerfile e release script                                                      | Configuração indica scale-to-zero e migrations no release; não comprova estado do deploy       |
| Render            | `render.yaml` ainda referencia variáveis Stripe                                              | Configuração alternativa/desatualizada frente ao adapter Asaas; revisar antes de reutilizar    |
| Vercel/EAS        | Web Next e configuração mobile `eas.json`; Vercel citada no legado                           | Hospedagem e builds remotos não inspecionados                                                  |

Há `.env` local no backend e `.env.local` no web/mobile, ignorados no Git do legado. Exemplos versionados foram localizados no backend e mobile, mas não no web. Configurações Firebase de cliente não devem ser automaticamente classificadas como secrets de servidor; seu escopo exige revisão própria. Nenhum valor de ambiente real foi copiado.

## Pontos de atenção comprovados ou delimitados

### Bloqueadores antes de reutilizar os fluxos afetados

| ID                                           | Evidência                                                                                                                                                                                             | Consequência e próxima validação                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R01 Admin simulado                           | `web/contexts/AuthContext.tsx`, `signInAdmin`: comparação de credenciais fixas, usuário fake e log da senha; `admin-login/page.tsx` persiste senha no localStorage                                    | Não portar o mecanismo. Não reproduzir as credenciais no inventário. Sessão visual não comprova acesso autorizado à API                          |
| R02 Autorização insuficiente                 | `routes/anamnesis.ts:59` e `:91`: listagem geral e busca por userId sem verificação de papel/proprietário; hook global só autentica. `routes/users.ts:102` também lista usuários sem role check local | Pelo código, cliente autenticado pode alcançar esses handlers; confirmar com testes isolados depois. Não foi realizado teste contra serviço real |
| R03 Rotas de manutenção                      | `server.ts`: rotas CRON escapam do requireAuth e só exigem segredo quando CRON_SECRET existe                                                                                                          | Falha de configuração deixa operação sem autenticação nesse caminho. Exigir proteção antes de reutilizar                                         |
| R04 Migrations não cobrem schema de máquinas | Modelos/enums/campos MachineRental/MachineKind no schema, sem ocorrência correspondente nos 26 SQLs examinados                                                                                        | Não assumir que migrate deploy reconstrói schema atual. Comparar em banco descartável; estado remoto desconhecido                                |
| R05 Seed destrutivo                          | `prisma/seed.ts:462` em diante apaga assinaturas, planos e configurações                                                                                                                              | Não tratar como seed inofensivo de desenvolvimento; criar estratégia sintética e proteção de destino no Luminix                                  |

### Riscos de migração e manutenção

| ID                                 | Evidência                                                                                           | Implicação                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R06 Horários locais rotulados UTC  | `utils/wallClock.ts:1` documenta a convenção; agenda usa helpers correspondentes                    | Importar como instante UTC comum deslocaria horários. Definir conversão campo a campo e testes de datas/limites de mês |
| R07 Idempotência webhook           | `routes/payments.ts:2013`: verifica evento, executa handlers e registra evento depois               | Registro único não comprova exclusão concorrente dos efeitos; revisar handlers e transações antes de afirmar garantia  |
| R08 Auth permissiva                | `utils/auth.ts`, `isAuthEnforced`: AUTH_ENFORCE=false desabilita exigência mesmo em produção        | Não transportar bypass como padrão; ambiente e autorização precisam de validação explícita                             |
| R09 Regras em arquivos grandes     | Payments 2.675 linhas; cliente HTTP web 1.829; appointments 1.490                                   | Separar por responsabilidade durante migração do domínio, evitando refatoração total sem testes                        |
| R10 Builds não são prova completa  | `web/next.config.ts` ignora lint/type errors; nenhum script de testes nos três manifests            | Estabelecer verificações no destino; dívida mobile mencionada em AGENTS não foi revalidada por execução                |
| R11 Processamento no processo HTTP | `utils/cron.ts`: wake, setInterval e setTimeout; sem fila durável localizada                        | Reinícios/réplicas exigem análise de execução duplicada, recuperação e fuso                                            |
| R12 Logs e projeções               | Prisma com logs detalhados e contextos com logs de usuário; alguns handlers devolvem objetos do ORM | Revisar minimização/redação e DTOs; não foi auditado todo payload de todas as rotas                                    |

Pontos positivos a preservar como intenção: verificação JWT com issuer/audience, verificações de criação de usuário contra escolha de papel, helper requireManager em configuração, token obrigatório no webhook Asaas, snapshots de pacote e uso de transação Serializable em caminhos de agenda. São mecanismos existentes, não certificação de segurança do conjunto.

## Contratos, duplicação e documentação

Não há package de contratos. `web/lib/api.ts`, `web/types/index.ts`, `mobile/src/lib/api.ts` e `mobile/src/types/commercial.ts` concentram representações próprias. Há utilitários equivalentes de datas/anamnese/banner em várias aplicações; sem auditoria semântica completa, não assumir que são idênticos nem extrair automaticamente.

O web mistura institucional, cliente e admin no mesmo App Router. O Luminix já prevê público/admin separados; a localização da experiência web autenticada do cliente ainda precisa de decisão explícita, pois ela existe no legado e não deve desaparecer sem decisão de produto.

README legado lista cancelamento de 8h, enquanto schema/migration e regras atuais apontam padrão de 4h configurável. `docs/luminix-saas-payments.md` é planejamento antigo de SaaS, não implementação: menciona Asaas/AbacatePay e trial/grace; não adotar automaticamente nem suas afirmações regulatórias/comerciais. O pedido atual menciona Stripe; confirmar gateway separadamente para caixa da clínica e mensalidade do SaaS.

`web/app/admin/acessos/page.tsx` é mock, apesar de aparência de gestão real. Atividades são derivadas de notificações. Não foi localizado ledger contábil próprio nem auditoria imutável; métricas do dashboard não equivalem a lucro ou analytics corporativo.

## Sequência proposta, ainda sem implementação

1. Fechar mapa de identidade global, clínica, vínculo, profissional, autorização e dados privados.
2. Decidir experiência web do cliente, separação financeira e fronteira do painel corporativo externo.
3. Preparar ambiente isolado e verificações; reconciliar schema/migrations em banco descartável antes de usar legado como baseline.
4. Entregar uma fatia: usuário autorizado em uma clínica cadastra/lista serviço; outra clínica não acessa o recurso.
5. Migrar clientes/profissionais e disponibilidade/agenda, com testes de horários e concorrência.
6. Migrar contratos comerciais, pacotes e vouchers; anamnese com proteção e preservação de versões. Ajustar ordem se o fluxo de agenda exigir anamnese.
7. Integrar pagamentos/notificações e demais interfaces; testar repetição, falha e recuperação.
8. Ensaiar importação com correspondência de IDs, totais/saldos, datas e reconciliação externa; só depois planejar transição operacional.

## Pendências de descoberta

- Volumes e schema realmente aplicado no banco; não acessar sem escopo específico.
- Cobertura de autorização de todas as rotas e respectivos payloads.
- Comportamento efetivo das integrações e telas em ambiente seguro.
- Política de retenção/exclusão e múltiplos vínculos de cliente.
- Dependências vulneráveis, secrets no histórico e licenças de templates não auditados neste levantamento.
- Origem/backup recuperável do legado e regra de conservação da cópia.

Próxima entrega recomendada: modelo conceitual de dados e matriz de acesso do núcleo multi-tenant, usando este inventário como entrada. Este documento não autoriza migration, correção de produção ou refatoração do legado.

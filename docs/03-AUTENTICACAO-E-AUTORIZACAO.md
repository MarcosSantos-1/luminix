# 03-AUTENTICACAO-E-AUTORIZACAO.md

## Step 4 — entrega 1 (2026-09-15)

Implementado: login da equipe em `/login` no admin com senha, magic link, recuperação e logout.
A opção Entrar da landing abre o login. Persistência Firebase por sessão da aba, sem copiar tokens
para armazenamento próprio ou URL. Magic link solicita explicitamente o e-mail no retorno,
inclusive em outro dispositivo. Cadastro por senha ainda não implementado;
magic link também permite criar conta individual sem conceder vínculo com clínica.

`GET /auth/session` no Fastify recebe `Authorization: Bearer <ID Token>`. O SDK Admin verifica
assinatura, projeto, expiração e revogação (`verifyIdToken(token, true)`). UID verificado associa
`identities.firebase_uid`, sem associação por e-mail, CPF ou identidade do frontend. INSERT
concorrente é idempotente e não reativa identidade disabled. Resposta mínima
`{ identity: { id } }`, sem clínica, membership, permissões ou custom claims de autorização.
Credencial ausente/inválida: 401; identidade disabled: 403; banco indisponível: 503 sanitizado.
Todas as respostas usam `Cache-Control: no-store`.

Admin usa proxy same-origin `/api/auth/session`, com upstream fixo `API_URL` (opcional) ou
`NEXT_PUBLIC_API_URL`, timeout e redirects bloqueados; produção exige HTTPS. Não encaminha cookies
nem headers de identidade/clínica. Sem necessidade de CORS nesta entrega. API limita 30
tentativas/minuto por IP observado, com memória limitada por processo; atrás do proxy esse IP é
o do servidor admin. Limitação distribuída/por identidade é necessária antes de escala.

Configuração Firebase necessária: habilitar Email/Password e Email link no projeto Luminix,
cadastrar domínios autorizados do admin (localhost somente para testes), templates de e-mail e
proteção contra enumeração de contas. Recuperação não revela existência da conta. Credenciais
Admin ficam exclusivas da API. Logout encerra sessão local, sem revogar outros dispositivos;
remoção de equipe deve revogar vínculo no backend, não depender de logout.

Validação automatizada: HTTP + PGlite para UID A/B, associação concorrente, headers forjados,
identidade desabilitada com token antigo, falhas sanitizadas e rate limit. Teste do wrapper
assegura verificação de revogação habilitada. Tokens rejeitados são simulados na suíte HTTP;
não equivalem por si só a validação hospedada de assinatura/projeto Firebase. Suíte do núcleo mantém
cobertura Clínica A × Clínica B, RLS, remoção de vínculo e permissões.

Check real executado: Firebase `luminix-316aa`, endpoint Neon pooled existente, `neondb/luminix`.
Conta sintética temporária: login por senha, ID Token real, associação estável, headers forjados,
token adulterado, identidade disabled, conta Firebase disabled e revogação de token antigo.
Conta Firebase removida no finally; identidade no Neon inteiramente revertida com ROLLBACK.
Runner: da raiz, `pnpm --filter @luminix/api exec tsx scripts/check-staff-session.ts
--allow-primary-fixture`. Confere destinos fixos antes de escrever, usa config privada local
da API/admin e não imprime tokens, senha ou erros do provedor. Somente para a fase inicial
sem clientes/dados reais, nunca como health check ou teste CI.

Sem migration ou alteração persistente Neon na entrega 1. Testes reais de e-mail, UI hospedada
e publicação ainda pendentes. Decisão em [ADR-010](decisions/ADR-010-SESSAO-FIREBASE-EQUIPE.md).

## Step 4 — entrega 2 (2026-09-15)

`POST /auth/owner-clinic` recebe somente `{ name }`, autentica pela política comum de sessão
e chama `luminix.bootstrap_owner_clinic(identity_id, name)`. Identidade vem exclusivamente do
token verificado, nunca de body/header. Campos extras: 400; token/identidade inválidos: 401/403;
retry com dados diferentes: 409; erro operacional: 503 sanitizado. Todos os retornos são no-store.

Migration 0002 aplicada no Neon principal, `neondb/luminix`. Função SQL SECURITY DEFINER com
search_path fixo e EXECUTE revogado de PUBLIC, sem grants de escrita direta ao runtime.
Operação atômica cria clínica draft, papel local owner, nove grants explícitos do catálogo da
migration 0001, membership ativo e settings BRL/pt-BR/America/Sao_Paulo. Permissões futuras não
são herdadas automaticamente. Slug inicial técnico `clinica-<UUID>`; edição pública futura.
Triggers existentes auditam registros locais com ator proprietário no mesmo rollback. Não cria
rascunho de onboarding nem conclui/publica clínica.

Recibo global `owner_clinic_bootstraps`, único por identidade e por clínica, com RLS por identidade
e sem acesso direto runtime. Não é coleção local de domínio. Lock da identidade serializa
bootstrap/disablement. Mesmo nome normalizado devolve mesma clínica (201 inicial, 200 repetição);
nome diferente: 409. É endpoint de primeira criação, não de todas as futuras clínicas da pessoa.
Replay exige identidade/membership owner ativos, clínica draft/active e grant clinic:manage atual.
Vínculo revogado não permite recriação. A função restaura settings SQL anteriores antes de retornar.

Admin usa proxy fixo `/api/auth/owner-clinic` com payload limitado a 2 KB. Após login, formulário
mínimo cria clínica e confirma rascunho/vínculo. Preserva nome após tentativa para retry seguro.
Contas existentes ou criadas por magic link podem usar o fluxo; cadastro por senha ainda futuro.
Dashboard/onboarding continuam demo; onboarding definitivo é Step 5.

Pool: statement timeout 10 s, lock timeout 3 s, idle-in-transaction timeout 15 s. Sem Firebase
dentro da operação SQL. Testes HTTP/PGlite: criação/retry concorrente, payload adulterado,
rollback/auditoria, identidade disabled, owner revogado, grants e isolamento A × B sob role restrita.
Runner real de sessão expandido: bootstrap/retry com ID Token real, ator, EXECUTE restrito e RLS
no Neon, com clínicas/auditoria revertidas. Duas conexões verificam serialização por timeout de
lock e rollback. Uma identidade sintética global é inserida para ficar visível às duas conexões e
removida no finally; conta temporária Firebase excluída. Não valida recebimento de e-mails/UI.

## Step 4 — entrega 3 (2026-09-16)

Implementado: `GET /auth/clinics` lista somente vínculos ativos da identidade autenticada,
com paginação de 50 clínicas. No admin, `/clinics` seleciona a clínica e permite trocar de
contexto sem novo login; a escolha local é apenas navegação. `GET /clinics/:clinicId/context`
revalida identidade, vínculo, clínica e papel atuais no backend; `GET
/clinics/:clinicId/settings` exige a permissão `settings:manage` definida pela rota.
Requisições clínicas executam em uma transação com contexto SQL local, locks de autorização,
filtro explícito por clínica e RLS. Estado da interface é descartado na troca ou revogação.
Não há autorização baseada em `currentClinicId`, e-mail ou custom claims.

Migration 0003 aplicada no Neon principal: funções de resolução/listagem/autorização com
EXECUTE delimitado e role `luminix_api` sem LOGIN na migration. LOGIN e senha foram
provisionados fora do Git como `DATABASE_URL_RUNTIME`; a API falha ao iniciar se a conexão
não comprovar NOSUPERUSER, NOBYPASSRLS, ausência de ownership/DDL/escrita direta e grants
esperados. O runner de migrations mantém credencial separada. A lista de clínicas não concede
acesso a endpoints de domínio: cada operação revalida membership e permissão.

Validação: suíte HTTP/PGlite inclui A × B, troca com o mesmo token, clínica não vinculada,
revogação de vínculo/grant, identidade desabilitada e token antigo. Runner real Firebase/Neon
passou com fixture temporária e rollback, inclusive role restrita; usuário Firebase removido.
`pnpm check` passou. Login magic link por e-mail real, fluxo autenticado no navegador hospedado
e persistência do onboarding ainda precisam de verificação/implementação respectivamente.
API publicada no Fly e admin em Vercel Production em 2026-09-16. Health da API passou, rota
clínica sem token retornou 401 e a UI hospedada encaminhou sessão anônima ao login. O admin
Production aponta ao host correto da API. Esses checks não substituem o fluxo autenticado
end-to-end no navegador hospedado.

## Separação

Authentication:
User identity.

Authorization:
User permissions.

Tenant context:
Organization/clinic currently being accessed.

Nunca misturar os três conceitos.

## Direções definidas e questões abertas

Cliente final: login por CPF e senha, recuperação via SMS no celular cadastrado. CPF é identificador, não segredo. O provedor e implementação técnica ainda não foram escolhidos. Gestor/equipe: Firebase com contas individuais; membership, roles e permissões definidas pelo gestor são aplicadas no backend.

A recuperação assistida pela clínica é uma intenção de produto ainda a especificar: trocar contato local não pode trocar silenciosamente o celular de autenticação global. A clínica precisa de permissão específica e verificação de identidade independente; SMS enviado ao novo número comprova posse desse número, não identidade do titular. Definir auditoria, notificação, contestação e tratamento das sessões antes da implementação. A clínica nunca deve conhecer ou definir a senha do cliente.

Detalhamento pendente em [PR13–PR16](13-REQUISITOS-PENDENTES-DO-PRODUTO.md). Não copiar automaticamente os fluxos Firebase do cliente legado nem tratar recuperação como simples CRUD de telefone.

## Roles

Permissão de operador da plataforma é distinta de papel administrativo em uma clínica. Operações globais exigem política explícita no backend e auditoria; nunca usar ausência de `clinic_id` como autorização global. Consultar a fronteira de plataforma em `00-ARQUITETURA.md`.

Evitar checks espalhados:

```ts
if (user.role === "admin")
```

em dezenas de arquivos.

Centralizar política de autorização.

Exemplo conceitual:

```text
can(user, "appointment:create", clinic)
can(user, "client:view", clinic)
can(user, "campaign:send", clinic)
```

## Troca de clínica

Com sessão válida e vínculos ativos nas clínicas A e B, o usuário toca na clínica desejada e
aguarda seus dados carregarem. A troca não solicita senha, SMS ou novo login e não repete
cadastro/anamnese já concluídos naquela clínica. É troca de contexto da mesma pessoa, mantendo
a sessão autenticada. Nova autenticação só pertence ao fluxo de sessão expirada/revogada ou a
operações sensíveis que a exijam, não à troca comum de clínica.

A validação do vínculo é automática no backend, sem etapa extra na interface. Para equipe,
validar membership e permissões atuais; para cliente final, validar o vínculo de cliente autorizado,
sem tratar cadastro local por si só como prova de identidade ou usar papel de equipe para cliente.
O `currentClinicId` salvo no app é apenas uma seleção e nunca concede acesso sozinho. Isso impede
que vínculo removido continue funcionando ou que um ID adulterado abra outra clínica.

Durante a troca, carregar o contexto autorizado e os dados da clínica selecionada. Cache,
armazenamento e respostas assíncronas devem distinguir identidade e `clinic_id`; uma resposta
atrasada de A não pode aparecer na tela de B. Se o vínculo deixou de existir, informar e retornar
ao seletor. Requisitos clínicos ainda pendentes pertencem à clínica correspondente, sem repetir
os já concluídos ou converter a troca em novo processo de autenticação.

Jornada do seletor do app cliente definida em PR21 de `13-REQUISITOS-PENDENTES-DO-PRODUTO.md`.
Esta direção de produto não implementa ainda autenticação CPF/senha nem o app cliente.

## Usuário removido

Ao remover usuário de uma clínica:

- acesso deve deixar de funcionar;
- tokens/sessões devem respeitar essa alteração;
- permissões antigas não podem permanecer indefinidamente válidas.

---

Remover membership de uma clínica, excluir a identidade global e cancelar uma assinatura são operações distintas. Não apagar automaticamente registros de outras clínicas nem zerar cadastros e assinaturas ao remover um vínculo. A política de retenção, exclusão e efeitos financeiros permanece em aberto e deve ser definida antes de implementar essas operações.

Para cliente final, distinguir também remover/gerenciar vínculo com uma clínica e excluir a conta
Luminix inteira. Desinstalar o app não solicita exclusão no backend nem cancela plano recorrente.
Mostrar claramente o alcance de cada ação e os efeitos financeiros; plano ativo não deve ser
cancelado silenciosamente por troca ou remoção de contexto. A política de cancelamento depende
do provedor e ainda será especificada.

Antes de lançamento iOS, oferecer início de exclusão da conta dentro do app, em opção fácil de
encontrar nas configurações, com confirmação e explicação dos dados excluídos, dos eventualmente
retidos por obrigação legal e dos prazos. Só desativar conta ou remover uma clínica não atende
à exigência de exclusão integral. Para assinaturas auto-renováveis Apple, explicar a cobrança e
oferecer gerenciamento/cancelamento; eventual agendamento da exclusão para o fim do plano deve
manter opção de excluir a conta imediatamente. Fonte:
[Apple — Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app).
Fluxo destrutivo e política de retenção continuam pendentes de implementação; ver PR26.

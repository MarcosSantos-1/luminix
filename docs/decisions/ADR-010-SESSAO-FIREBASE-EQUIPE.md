# ADR-010 — Sessão Firebase da equipe

Status: adotada nas entregas 1–3 da Step 4, 2026-09-16.

Firebase autentica contas individuais da equipe. Requisições autenticadas usam ID Token
verificado no backend, incluindo revogação, e resolvem identidade interna ativa por firebase_uid.
Não emitir credencial própria nesta entrega nem confiar em permissões permanentes de custom
claims. Associação de identidade não concede membership e não usa e-mail para vincular contas.

Admin usa persistência por sessão e proxy same-origin com upstream fixo. Não há cookie próprio
nem autenticação server-side das telas demo. Acesso clínico exige vínculo/permissão atuais
via withClinicTransaction. CPF/senha de cliente permanece fora deste fluxo.

Alternativa adiada: cookie Firebase HttpOnly para renderização autenticada no servidor, que
exigiria política CSRF, expiração, troca e revogação; não necessário para a bancada atual.

Consequências: verificação de revogação exige consulta externa; falhas negam acesso. Logout local
não revoga tokens de outros dispositivos. Controle distribuído de tentativas, verificação UI
hospedada e auditoria global continuam condições operacionais antes de clientes reais,
documentadas no guia de autenticação e TD-003.

## Bootstrap do primeiro proprietário — entrega 2

Migration 0002 usa função SQL de privilégio delimitado, revogada de PUBLIC, recebendo identidade
autenticada e nome. Permite criar raiz tenant antes de membership sem INSERT/UPDATE amplo ao
futuro runtime restrito. Settings anteriores são restaurados; search_path fixo pg_catalog.

Recibo global identity-scoped registra primeira criação, com PK identity_id, UNIQUE clinic_id,
nome original, RLS e nenhum grant direto runtime. Exceção ao escopo local: controle de bootstrap
da identidade, não dado consultável pela clínica. Alternativa rejeitada: procurar qualquer owner
por nome globalmente a cada retry sem invariante de primeira criação. Recibo não é membership e
não autoriza acesso revogado. Política de criar novas clínicas ficará em fluxo separado.

Lock da identidade serializa bootstrap/disablement. Clínica draft, owner, grants explícitos,
membership e settings são atômicos com auditoria. Não cria onboarding definitivo nem publica.
Função confia no processo API para autenticar a identidade; credencial SQL comprometida não é
prova de token e exige contenção própria. Execução restrita testada no Neon; a entrega 3 usa
credencial runtime própria.

## Contexto clínico e credencial — entrega 3

O ID Firebase autentica a pessoa, `identities` resolve seu ID interno, e a clínica escolhida
é somente um parâmetro de seleção. Cada rota clínica revalida membership ativo e, quando
exigido, o grant local atual em transação. Locks mantêm revogação e operação em ordem; RLS
e filtros `clinic_id` protegem as leituras. O backend nunca aceita a permissão requerida do
frontend. Listagem paginada de vínculos não é autorização para operação de domínio.

Migration 0003 define funções de privilégio delimitado para resolução, listagem e checagem
de contexto. A API conecta com `luminix_api`, role não proprietária/NOBYPASSRLS, verificada
na inicialização. Credenciais de migration e runtime são separadas. Um processo que controle
a conexão SQL ainda pode modificar settings de sessão; manter código/credencial privados e
não expor SQL dinâmico é parte da fronteira de confiança.

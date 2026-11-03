# Acesso e permissões — critérios de regressão

Estes cenários são especificações. Os testes executáveis da API estão em `apps/api/tests`;
a inspeção visual não substitui sessão real hospedada.

## Login e cadastro

- Desktop e mobile: sem deslocamento horizontal ou bounce; rolagem vertical quando conteúdo,
  zoom ou teclado exigirem, sem bloquear preenchimento. Imagem do cadastro só a partir de 1024px.
- Navegar por Tab/Shift+Tab; rótulos permanentes, foco visível, check por Espaço e alvos de 44px.
- Cadastro: telefone incompleto, senhas diferentes, mínimo de seis caracteres e aceite obrigatório
  impedem envio; mostrar/ocultar senha preserva o valor. Não criar conta real em teste visual.
- Login sem “Manter conectada”: sessão Firebase limitada à aba. Com a opção: fechar/reabrir
  navegador restaura sessão; desmontar/montar provider não troca persistência. Logout encerra acesso.
- Google e magic link, quando expostos, usam sessão de aba; retorno do link exige e-mail correto.
- Falha de rede não deve mostrar sucesso; recuperação não revela se o e-mail tem cadastro.
- Sessão revogada/identidade desabilitada perde acesso mesmo com persistência local.

## Isolamento

- Repetir casos de `auth-session`, `staff-authorization`, `owner-clinic` e `multi-tenant-core`.
- Trocar A/B rapidamente e remover vínculo: respostas atrasadas não podem repor contexto antigo.
- Rascunho deve retomar onboarding; clínica única ativa abre painel; múltiplas abrem seletor.
- Endereço alterado limpa o mapa anterior; erro/ausência de Maps não bloqueia preenchimento manual.
- Upload de logo enquanto outros campos mudam preserva os dados mais recentes; retomada usa mídia salva.

Pendências de lançamento e conteúdo: TD-003 e TD-005. Não registrar aceite legal por um mero check
local; implementar documento/versionamento e persistência antes da liberação real.

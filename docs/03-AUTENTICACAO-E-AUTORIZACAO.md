# 03-AUTENTICACAO-E-AUTORIZACAO.md

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

Usuário pode pertencer às clínicas A e B.

Trocar clínica não deve conceder acesso automaticamente.

Sempre validar membership.

Nunca confiar apenas em:

```text
currentClinicId
```

salvo no app.

O backend deve verificar que o usuário realmente pertence à clínica solicitada.

## Usuário removido

Ao remover usuário de uma clínica:

- acesso deve deixar de funcionar;
- tokens/sessões devem respeitar essa alteração;
- permissões antigas não podem permanecer indefinidamente válidas.

---

Remover membership de uma clínica, excluir a identidade global e cancelar uma assinatura são operações distintas. Não apagar automaticamente registros de outras clínicas nem zerar cadastros e assinaturas ao remover um vínculo. A política de retenção, exclusão e efeitos financeiros permanece em aberto e deve ser definida antes de implementar essas operações.

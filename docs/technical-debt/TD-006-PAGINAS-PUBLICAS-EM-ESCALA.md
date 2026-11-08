# TD-006 — Evolução das páginas públicas

- Registrado: 2026-11-03
- Estado: aberto; não bloqueia preparação sem clientes reais
- Contexto: ADR-021

A API pública usa `no-store` e limite de 120 requisições/minuto por IP/processo. A web reutiliza a
projeção por slug e invalida após escrita, com expiração limitada pela janela de um minuto.
Antes de tráfego comercial, medir o cache e o compartilhamento de IP de saída entre visitantes,
definir limite distribuído e acrescentar métricas de disponibilidade e de invalidação sem dados pessoais.

Também pendentes: editor de frases por categoria, edição de slug com redirects, revisão de SEO
antes de retirar `noindex`, fotos editoriais e testes browser autenticados de publicação completa.
A leitura e mutação da publicação já têm testes de integração SQL/HTTP e isolamento tenant.
Agendamento online e login privado são frentes próprias, não estão implementados por esta entrega.

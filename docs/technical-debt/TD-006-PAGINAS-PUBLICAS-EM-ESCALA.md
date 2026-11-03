# TD-006 — Evolução das páginas públicas

- Registrado: 2026-11-03
- Estado: aberto; não bloqueia preparação sem clientes reais
- Contexto: ADR-021

A leitura pública usa `no-store` e limite de 120 requisições/minuto por IP/processo. A web faz
SSR e pode compartilhar IP de saída entre visitantes. Antes de tráfego comercial, medir carga,
definir limite distribuído e cache com invalidação imediata ao retirar publicação, sem expor
endereços/contatos previamente removidos. Acrescentar métricas de disponibilidade sem dados pessoais.

Também pendentes: editor de frases por categoria, edição de slug com redirects, revisão de SEO
antes de retirar `noindex`, fotos editoriais e testes browser autenticados de publicação completa.
A leitura e mutação da publicação já têm testes de integração SQL/HTTP e isolamento tenant.
Agendamento online e login privado são frentes próprias, não estão implementados por esta entrega.

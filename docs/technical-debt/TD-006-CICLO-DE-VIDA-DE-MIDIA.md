# TD-006 — Ciclo de vida e cache de mídia

Status: Aberta

Data: 2026-10-09

## Dívida

O upload inicial gera WebP no navegador e a API valida assinatura, dimensões e tamanho antes de
persistir no R2. Ainda não existe job que remova assets `pending`, `failed` ou `superseded`, nem
decodificação/reprocessamento integral no servidor.

O domínio atual `r2.dev` não oferece o cache de borda configurável esperado para produção. As chaves
imutáveis já permitem cache longo no navegador, mas o domínio de mídia definitivo depende do cutover
manual de DNS.

## Encerramento necessário antes de dados reais

- definir retenção e job idempotente de limpeza a partir de `media_assets`;
- usar domínio próprio Cloudflare para entrega e validar o cache de borda;
- avaliar Cloudflare Images/Worker para redecodificar entradas no servidor e upload direto assinado
  se volume, segurança ou custo justificarem;
- testar substituição, abandono e recuperação com imagens representativas.

# TD-011 — Acervo de mídia: próximos passos conhecidos

```text
ID: TD-011
Data: 2026-11-08
Módulo: API (media, media-storage), admin (components/manager/media), R2 privado
Problema:
  - Lixeira não é esvaziada e não há exclusão definitiva: objetos continuam no R2.
  - Sem cota por plano; o uso é só exibido.
  - Upload passa pela API (limite 2,5 MB por variante); upload direto ao R2 por URL assinada
    reduziria carga e permitiria arquivos maiores e vídeos.
  - client_id existe em media_items, mas não há álbum por cliente nem par antes/depois.
  - Consentimento de uso de imagem da cliente não é registrado.
  - Usar uma foto do acervo no site exige cópia explícita para o bucket público (não implementado).
Impacto atual: armazenamento cresce sem limpeza; organização só por pastas.
Risco futuro: custo de R2 e retenção de dados pessoais além do necessário (LGPD).
Workaround atual: lixeira restaurável; remoção manual no R2 se necessário.
Quando deve ser resolvido: exclusão definitiva e consentimento antes de clientes reais.
Prioridade: P1 (exclusão definitiva, consentimento), P2 (cotas, álbum por cliente), P3 (vídeo)
Status: aberto
```

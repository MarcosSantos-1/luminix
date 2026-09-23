# Migração do gestor Charme & Bela → Luminix

Documento de trabalho para não perder regras durante a migração. O legado é fonte de descoberta,
não padrão de arquitetura. Cada item só é concluído quando UI, API, banco, autorização, isolamento
por clínica e testes estiverem cobertos.

## Legenda

- [x] entregue no Luminix
- [~] entregue parcialmente / base pronta
- [ ] ainda não migrado
- [!] requer decisão de produto antes de portar

## Agenda

- [x] Lista real de agendamentos por período e por clínica.
- [x] Novo agendamento administrativo com cliente, serviço, profissional opcional, data e hora.
- [x] “Chave mestra” do gestor: permite horário fora do funcionamento e conflito após confirmação.
- [x] Avisos do backend para horário no passado, fora da disponibilidade e sobreposição.
- [x] Disponibilidade semanal fixa da clínica com mais de um intervalo no mesmo dia.
- [x] Exceção por data para fechar, ampliar ou reduzir o expediente.
- [~] Alterar disponibilidade preserva agendamentos existentes; preview global de afetados pendente.
- [x] Isolamento por clínica, FKs compostas, RLS, auditoria e timezone da clínica.
- [~] Visualização semanal real; visão mensal e filtros avançados ainda não migrados.
- [ ] Reagendar, cancelar, concluir e marcar falta.
- [ ] Política de cancelamento, crédito/reembolso e retentativa manual.
- [ ] Autoagendamento do cliente com travas (sem chave mestra).
- [ ] Capacidade simultânea configurável por profissional/recurso.
- [ ] Disponibilidade por profissional e bloqueios pessoais.
- [ ] Máquinas/recursos (laser, crio) e ocorrências mensais.
- [ ] Pacotes, vouchers, assinaturas, origem e situação financeira no card.
- [ ] Notificações e lembretes idempotentes.
- [!] Decidir se reduzir/fechar horário cancela automaticamente; nesta fase preserva e alerta.

## Clientes

- [x] Lista e busca reais por nome, telefone ou e-mail, sempre no tenant atual.
- [x] Cadastro local sem criar/vincular identidade global por coincidência de contato.
- [x] Nome, telefone, e-mail, nascimento e observações locais da clínica.
- [x] Situação ativa/arquivada no modelo; UI inicial lista ativas por padrão.
- [x] Contagem de agendamentos e última visita por cliente.
- [ ] Editar cadastro, arquivar/restaurar e tela de detalhes.
- [ ] Convite verificado para vincular o cadastro local à identidade do app.
- [ ] Histórico, anamnese versionada, alertas clínicos e consentimentos.
- [ ] Assinaturas, pacotes, vouchers, pagamentos e cartões.
- [ ] Importação reconciliada do legado com mapa de IDs e contatos duplicados.

## Fora deste recorte

- [ ] Serviços, equipe/profissionais, financeiro, estoque, marketing e relatórios.
- [ ] Portal/app do cliente consumindo a nova disponibilidade.
- [ ] Migração de dados reais do Charme & Bela.
- [ ] Paridade visual detalhe a detalhe com telas legadas; prevalece o design system Luminix.

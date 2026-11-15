import { ComingSoon, TabPage } from '../../src/ui/space'

export default function History() {
  return (
    <TabPage title="Histórico">
      <ComingSoon
        icon="clock"
        title="Atendimentos e pagamentos"
        body="Depois da sua primeira visita, tudo o que você fez e pagou neste espaço fica registrado aqui."
      />
    </TabPage>
  )
}

import { ComingSoon, TabPage } from '../../src/ui/space'

export default function Agenda() {
  return (
    <TabPage title="Agenda">
      <ComingSoon
        icon="calendar"
        title="Seus horários vão aparecer aqui"
        body="O agendamento pelo aplicativo chega junto com o acesso definitivo. Por enquanto, marque pelo site do Luminix."
      />
    </TabPage>
  )
}

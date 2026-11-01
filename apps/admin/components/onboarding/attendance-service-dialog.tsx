import { Button, Checkbox, Label } from '@heroui/react'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { formatMoney, type Payload } from './model'
import { BlurDialog, GlassField, GlassSelect } from './ui'
import {
  applyServicePolicies,
  attendancePercent,
  filterPolicyServices,
  retentionOptions,
  type ServicePolicyPatch,
} from './attendance-policy'

export function AttendanceServiceDialog({
  payload,
  initialIds,
  onApply,
  onClose,
}: {
  payload: Payload
  initialIds: string[]
  onApply: (payload: Payload) => void
  onClose: () => void
}) {
  const [selectedIds, setSelectedIds] = useState(initialIds)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'special' | 'overrides'>('all')
  const [deadline, setDeadline] = useState('keep')
  const [lateChange, setLateChange] = useState('keep')
  const [noShow, setNoShow] = useState('keep')
  const selected = new Set(selectedIds)
  const visible = filterPolicyServices(payload.services, query, filter)
  const selectedServices = payload.services.filter((service) => selected.has(service.id))
  const patch: ServicePolicyPatch = {}
  if (deadline !== 'keep')
    patch.cancellationHours = deadline === 'inherit' ? null : Number(deadline)
  if (lateChange !== 'keep')
    patch.lateChangeRetentionPercent = lateChange === 'inherit' ? null : Number(lateChange)
  if (noShow !== 'keep') patch.noShowRetentionPercent = noShow === 'inherit' ? null : Number(noShow)
  const hasChanges = Object.keys(patch).length > 0
  const commonOptions = [
    { id: 'keep', label: 'Manter o valor de cada tratamento' },
    { id: 'inherit', label: 'Seguir a regra do espaço' },
  ]
  const percentOptions = (field: 'lateChangeRetentionPercent' | 'noShowRetentionPercent') => [
    ...commonOptions,
    ...[
      ...new Set([
        ...retentionOptions().map((option) => Number(option.id)),
        ...selectedServices.flatMap((service) => (service[field] == null ? [] : [service[field]])),
        ...[field === 'noShowRetentionPercent' ? noShow : lateChange]
          .filter((value) => value !== 'keep' && value !== 'inherit').map(Number),
      ]),
    ]
      .sort((a, b) => a - b)
      .map((percent) => ({
        id: String(percent),
        label: percent === 0 ? 'Sem retenção' : `Reter ${percent}% do valor antecipado`,
      })),
  ]
  return (
    <BlurDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      className="ob2-policy-dialog"
      title="Regras por tratamento"
      description="Selecione um ou vários tratamentos, inclusive os especiais. Só os campos que você alterar serão aplicados aos selecionados."
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            className="ob2-cta"
            isDisabled={!selectedServices.length || !hasChanges}
            onPress={() => {
              onApply(applyServicePolicies(payload, selectedIds, patch))
              onClose()
            }}
          >
            Aplicar a {selectedServices.length} tratamento(s)
          </Button>
        </>
      }
    >
      <div className="ob2-policy-layout">
        <section className="ob2-policy-selection" aria-label="Selecionar tratamentos">
          <GlassField
            label="Pesquisar tratamentos"
            placeholder="Nome, categoria ou aparelho"
            icon={<Search size={18} aria-hidden />}
            value={query}
            onChange={setQuery}
          />
          <GlassSelect
            label="Mostrar tratamentos"
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[
              { id: 'all', label: 'Todos os tratamentos' },
              { id: 'special', label: 'Somente especiais / aparelhos' },
              { id: 'overrides', label: 'Com regras próprias / exceções' },
            ]}
          />
          <div className="ob2-policy-selection-actions">
            <Button
              variant="ghost"
              isDisabled={!visible.length}
              onPress={() =>
                setSelectedIds((current) => [
                  ...new Set([...current, ...visible.map((service) => service.id)]),
                ])
              }
            >
              Selecionar resultados ({visible.length})
            </Button>
            <Button
              variant="ghost"
              isDisabled={!selectedIds.length}
              onPress={() => setSelectedIds([])}
            >
              Limpar seleção
            </Button>
          </div>
          <p className="ob2-copy" role="status">
            {selectedServices.length} selecionado(s), incluindo{' '}
            {selectedServices.filter((service) => service.bookingMode === 'manual_release').length}{' '}
            especial(is). A busca não desfaz a seleção.
          </p>
          <div className="ob2-policy-list" role="group" aria-label="Tratamentos disponíveis">
            {visible.length === 0 ? (
              <p className="ob2-copy">Nenhum tratamento encontrado. Tente outro nome ou filtro.</p>
            ) : (
              visible.map((service) => {
                const special = service.bookingMode === 'manual_release'
                const hours =
                  service.cancellationHours ??
                  (special
                    ? payload.preferences.specialCancellationHours
                    : payload.preferences.cancellationHours)
                return (
                  <Checkbox
                    key={service.id}
                    className="ob2-policy-treatment"
                    isSelected={selected.has(service.id)}
                    onChange={(checked) =>
                      setSelectedIds((current) =>
                        checked
                          ? [...new Set([...current, service.id])]
                          : current.filter((id) => id !== service.id),
                      )
                    }
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label className="ob2-policy-treatment-copy">
                        <strong>{service.name}</strong>
                        <span>
                          {service.priceType === 'quote'
                            ? 'Sob consulta'
                            : `${service.priceType === 'from' ? 'A partir de ' : ''}${formatMoney(service.priceCents)}`}{' '}
                          · {service.durationMinutes} min
                        </span>
                        <span>
                          {special
                            ? `Especial · ${service.resourceName || 'Aparelho / data específica'}`
                            : service.category}
                        </span>
                        <small>
                          Atual: aviso {hours}h · tardio{' '}
                          {attendancePercent(
                            payload.preferences,
                            service,
                            'lateChangeRetentionPercent',
                          )}
                          % · falta{' '}
                          {attendancePercent(
                            payload.preferences,
                            service,
                            'noShowRetentionPercent',
                          )}
                          %
                        </small>
                      </Label>
                    </Checkbox.Content>
                  </Checkbox>
                )
              })
            )}
          </div>
        </section>
        <section className="ob2-policy-values" aria-label="Valores para aplicar">
          <h3>Aplicar aos selecionados</h3>
          <GlassSelect
            label="Prazo de cancelamento"
            value={deadline}
            onChange={setDeadline}
            options={[
              ...commonOptions,
              ...[
                ...new Set([
                  0,
                  4,
                  12,
                  24,
                  48,
                  72,
                  ...[deadline].filter((value) => value !== 'keep' && value !== 'inherit').map(Number),
                  ...selectedServices.flatMap((service) =>
                    service.cancellationHours == null ? [] : [service.cancellationHours],
                  ),
                ]),
              ]
                .sort((a, b) => a - b)
                .map((value) => ({
                  id: String(value),
                  label: value === 0 ? 'Até o horário do atendimento' : `${value} horas antes`,
                })),
            ]}
          />
          <p className="ob2-copy">
            {payload.preferences.reschedulingHours == null
              ? 'A remarcação acompanha o prazo de cada tratamento.'
              : `A remarcação continua com o prazo geral próprio de ${payload.preferences.reschedulingHours}h.`}
          </p>
          <GlassSelect
            label="Cancelamento ou remarcação tardios"
            value={lateChange}
            onChange={setLateChange}
            options={percentOptions('lateChangeRetentionPercent')}
          />
          <GlassSelect
            label="Falta / não comparecimento"
            value={noShow}
            onChange={setNoShow}
            options={percentOptions('noShowRetentionPercent')}
          />
          <p className="ob2-copy">
            Zero isenta o tratamento. “Seguir a regra do espaço” remove a exceção desse campo.
            “Manter” preserva diferenças entre os tratamentos.
          </p>
          <p className="ob2-rule-example">
            Percentuais sobre o valor antecipado do avulso, sem acumular falta e aviso tardio. Sem
            antecipação, nada a reter. As condições e os direitos legais continuam valendo.
          </p>
          {!hasChanges ? (
            <p className="ob2-copy">Escolha pelo menos um campo para alterar antes de aplicar.</p>
          ) : null}
        </section>
      </div>
    </BlurDialog>
  )
}

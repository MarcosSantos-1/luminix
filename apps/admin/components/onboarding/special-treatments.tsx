import { Button, Card, Checkbox, Label } from '@heroui/react'
import { CalendarDays, Check, Plus, Search, Sparkles, Star } from 'lucide-react'
import { useState } from 'react'
import './special-treatments.css'
import { categories, type Payload, type Service } from './model'
import { BlurDialog, GlassField, GlassSelect } from './ui'
import {
  applyEquipment,
  configuredEquipment,
  equipmentKey,
  suggestedEquipment,
  type EquipmentChoice,
} from './special-equipment'

export function SpecialTreatments({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (payload: Payload) => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmNo, setConfirmNo] = useState(false)
  const [services, setServices] = useState<Service[]>([])
  const [selected, setSelected] = useState<EquipmentChoice[]>([])
  const [customChoices, setCustomChoices] = useState<EquipmentChoice[]>([])
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [newServiceName, setNewServiceName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState('')
  const configured = configuredEquipment(payload.services)
  const specialCount = configured.reduce((sum, item) => sum + item.serviceIds.length, 0)
  const suggestions = suggestedEquipment(services)
  const choices = [...suggestions, ...customChoices]
    .filter(
      (item, index, items) =>
        items.findIndex((other) => equipmentKey(other.name) === equipmentKey(item.name)) === index,
    )
    .filter((item) => equipmentKey(item.name).includes(equipmentKey(query)))

  function show() {
    setServices(payload.services)
    setSelected(configuredEquipment(payload.services))
    setCustomChoices(configuredEquipment(payload.services))
    setQuery('')
    setCustom(false)
    setError('')
    setOpen(true)
  }

  function toggle(choice: EquipmentChoice) {
    setError('')
    const exists = selected.some((item) => equipmentKey(item.name) === equipmentKey(choice.name))
    if (exists) {
      setSelected(selected.filter((item) => equipmentKey(item.name) !== equipmentKey(choice.name)))
      return
    }
    const available = choice.serviceIds.filter(
      (id) => !selected.some((item) => item.serviceIds.includes(id)),
    )
    if (!available.length) {
      setError(
        'Esses serviços já estão vinculados a outro aparelho. Edite o vínculo antes de selecionar este.',
      )
      return
    }
    setSelected([...selected, { ...choice, serviceIds: available }])
  }

  function startCustom() {
    setName('')
    setServiceIds([])
    setNewServiceName('')
    setNewCategory(payload.occupations[0] ?? categories[0] ?? '')
    setError('')
    setCustom(true)
  }

  function addCustom() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Informe o nome do aparelho.')
    const duplicate = selected.find((item) => equipmentKey(item.name) === equipmentKey(trimmed))
    if (duplicate)
      return setError('Esse aparelho já foi selecionado. Edite os serviços no card dele.')
    const newName = newServiceName.trim()
    if (!serviceIds.length && !newName)
      return setError('Selecione pelo menos um serviço ou cadastre um novo.')
    if (
      newName &&
      services.some((service) => equipmentKey(service.name) === equipmentKey(newName))
    ) {
      return setError('Esse serviço já está cadastrado. Selecione-o na lista.')
    }
    if (newName && services.length >= 80)
      return setError('O limite é de 80 serviços. Selecione um serviço existente.')
    const nextServices = [...services]
    const nextIds = [...serviceIds]
    if (newName) {
      const service: Service = {
        id: crypto.randomUUID(),
        name: newName,
        category: newCategory,
        description: '',
        priceCents: 0,
        priceType: 'quote',
        durationMinutes: 60,
        bookingMode: 'manual_release',
        resourceName: trimmed,
        audience: payload.clinic.defaultAudience,
        sensitive: false,
        cancellationHours: null,
      }
      nextServices.push(service)
      nextIds.push(service.id)
    }
    setServices(nextServices)
    setSelected([...selected, { name: trimmed, serviceIds: nextIds }])
    setCustomChoices([
      ...customChoices.filter((item) => equipmentKey(item.name) !== equipmentKey(trimmed)),
      { name: trimmed, serviceIds: nextIds },
    ])
    setCustom(false)
    setQuery('')
    setError('')
  }

  function save() {
    if (selected.some((item) => !item.serviceIds.length)) {
      return setError('Selecione ao menos um serviço para cada aparelho ou desmarque o aparelho.')
    }
    const nextServices = applyEquipment(services, selected)
    setPayload({
      ...payload,
      services: nextServices,
      occupations: [
        ...new Set([...payload.occupations, ...nextServices.map((service) => service.category)]),
      ],
      preferences: { ...payload.preferences, specialTreatmentsDismissed: false },
    })
    setOpen(false)
  }

  return (
    <>
      {payload.preferences.specialTreatmentsDismissed && !specialCount ? (
        <Button variant="ghost" className="ob2-quiet ob2-special-reopen" onPress={show}>
          <Star size={16} aria-hidden /> Configurar tratamentos especiais
        </Button>
      ) : (
        <Card className="ob2-panel ob2-special-question">
          <Card.Content>
            <div className="ob2-special-heading">
              <span className="ob2-special-icon">
                <CalendarDays size={24} aria-hidden />
              </span>
              <div>
                <h2>
                  {specialCount
                    ? 'Tratamentos especiais configurados'
                    : 'Você utiliza aparelhos alugados ou compartilhados?'}
                </h2>
                <p>
                  {specialCount
                    ? `${specialCount} ${specialCount === 1 ? 'serviço depende' : 'serviços dependem'} de aparelhos disponíveis em datas específicas.`
                    : 'Como laser e criolipólise: atendimentos que dependem de um aparelho disponível em datas específicas.'}
                </p>
              </div>
            </div>
            {specialCount ? (
              <div className="ob2-special-actions">
                <span className="ob2-special-badge">
                  <Star size={15} aria-hidden /> {configured.length}{' '}
                  {configured.length === 1 ? 'aparelho' : 'aparelhos'}
                </span>
                <Button className="ob2-quiet" variant="ghost" onPress={show}>
                  Editar aparelhos e serviços
                </Button>
              </div>
            ) : (
              <div className="ob2-special-actions">
                <Button className="ob2-cta" onPress={show}>
                  Sim, configurar aparelhos
                </Button>
                <Button className="ob2-quiet" variant="ghost" onPress={() => setConfirmNo(true)}>
                  Não utilizo
                </Button>
              </div>
            )}
          </Card.Content>
        </Card>
      )}
      <BlurDialog
        isOpen={confirmNo}
        onOpenChange={setConfirmNo}
        className="ob2-special-confirm"
        size="md"
        title="Continuar sem aparelhos alugados?"
        description="O card será ocultado. Você poderá reabrir esta configuração pelo link abaixo da busca."
        footer={
          <>
            <Button variant="ghost" className="ob2-quiet" onPress={() => setConfirmNo(false)}>
              Voltar
            </Button>
            <Button
              className="ob2-cta"
              onPress={() => {
                setPayload({
                  ...payload,
                  preferences: { ...payload.preferences, specialTreatmentsDismissed: true },
                })
                setConfirmNo(false)
              }}
            >
              Confirmar e ocultar
            </Button>
          </>
        }
      >
        <p className="ob2-copy">Seus serviços continuarão com as configurações atuais.</p>
      </BlurDialog>
      <BlurDialog
        isOpen={open}
        onOpenChange={setOpen}
        className="ob2-special-modal"
        size="md"
        title={
          custom ? 'Cadastrar outro aparelho alugado' : 'Seus aparelhos e tratamentos especiais'
        }
        description={
          custom
            ? 'Dê um nome ao aparelho e escolha os serviços que dependem dele.'
            : 'Selecione os aparelhos que você aluga ou compartilha. As sugestões consideram os serviços que você escolheu.'
        }
        footer={
          <>
            <Button
              variant="ghost"
              className="ob2-quiet"
              onPress={() => {
                if (custom) {
                  setCustom(false)
                  setError('')
                } else setOpen(false)
              }}
            >
              {custom ? 'Voltar aos aparelhos' : 'Cancelar'}
            </Button>
            <Button className="ob2-cta" onPress={custom ? addCustom : save}>
              {custom ? 'Adicionar aparelho' : 'Salvar tratamentos especiais'}
            </Button>
          </>
        }
      >
        {custom ? (
          <>
            <GlassField
              label="Nome do aparelho"
              value={name}
              onChange={setName}
              maxLength={160}
              placeholder="Ex.: Laser alugado da clínica"
            />
            <fieldset className="ob2-equipment-services">
              <legend>Quais serviços utilizam este aparelho?</legend>
              {services.map((service) => {
                const assigned = selected.find((item) => item.serviceIds.includes(service.id))
                return (
                  <Checkbox
                    key={service.id}
                    isSelected={serviceIds.includes(service.id)}
                    isDisabled={Boolean(assigned)}
                    onChange={(checked) =>
                      setServiceIds(
                        checked
                          ? [...serviceIds, service.id]
                          : serviceIds.filter((id) => id !== service.id),
                      )
                    }
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Content>
                      <Label>
                        {service.name}
                        {assigned ? ` — vinculado a ${assigned.name}` : ''}
                      </Label>
                    </Checkbox.Content>
                  </Checkbox>
                )
              })}
            </fieldset>
            <div className="ob2-equipment-new-service">
              <GlassField
                label="Adicionar um novo serviço (opcional)"
                value={newServiceName}
                onChange={setNewServiceName}
                maxLength={160}
                placeholder="Nome do atendimento realizado com o aparelho"
              />
              {newServiceName.trim() ? (
                <>
                  <GlassSelect
                    label="Categoria do novo serviço"
                    value={newCategory}
                    onChange={setNewCategory}
                    options={categories.map((category) => ({ id: category, label: category }))}
                  />
                  <p className="ob2-copy">
                    O serviço será criado com 60 min e preço sob consulta. Ajuste duração, preço e
                    público no card do serviço após salvar.
                  </p>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <GlassField
              label="Buscar aparelho"
              icon={<Search size={18} />}
              value={query}
              onChange={setQuery}
              placeholder="Nome do aparelho"
            />
            <div className="ob2-equipment-grid">
              {choices.map((choice) => {
                const active = selected.find(
                  (item) => equipmentKey(item.name) === equipmentKey(choice.name),
                )
                return (
                  <Card
                    key={choice.name}
                    className={`ob2-equipment-card${active ? ' is-selected' : ''}`}
                  >
                    <Card.Content>
                      <Button
                        className="ob2-equipment-toggle"
                        variant="ghost"
                        aria-pressed={Boolean(active)}
                        onPress={() => toggle(choice)}
                      >
                        <span className="ob2-equipment-symbol">
                          <Sparkles size={28} aria-hidden />
                        </span>
                        <strong>{choice.name}</strong>
                        <span>
                          {active
                            ? 'Selecionado'
                            : `${choice.serviceIds.length} ${choice.serviceIds.length === 1 ? 'serviço compatível' : 'serviços compatíveis'}`}
                        </span>
                        {active ? (
                          <Check className="ob2-equipment-check" size={20} aria-hidden />
                        ) : (
                          <Plus className="ob2-equipment-check" size={20} aria-hidden />
                        )}
                      </Button>
                      {active ? (
                        <details className="ob2-equipment-edit">
                          <summary>
                            {active.serviceIds.length}{' '}
                            {active.serviceIds.length === 1
                              ? 'serviço vinculado'
                              : 'serviços vinculados'}{' '}
                            · Editar
                          </summary>
                          <fieldset className="ob2-equipment-services">
                            <legend>Serviços vinculados</legend>
                            {services.map((service) => {
                              const elsewhere = selected.some(
                                (item) => item !== active && item.serviceIds.includes(service.id),
                              )
                              return (
                                <Checkbox
                                  key={service.id}
                                  isSelected={active.serviceIds.includes(service.id)}
                                  isDisabled={elsewhere}
                                  onChange={(checked) =>
                                    setSelected(
                                      selected.map((item) =>
                                        item === active
                                          ? {
                                              ...item,
                                              serviceIds: checked
                                                ? [...item.serviceIds, service.id]
                                                : item.serviceIds.filter((id) => id !== service.id),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <Checkbox.Control>
                                    <Checkbox.Indicator />
                                  </Checkbox.Control>
                                  <Checkbox.Content>
                                    <Label>
                                      {service.name}
                                      {elsewhere ? ' — outro aparelho' : ''}
                                    </Label>
                                  </Checkbox.Content>
                                </Checkbox>
                              )
                            })}
                          </fieldset>
                        </details>
                      ) : (
                        <p className="ob2-equipment-related">
                          {services
                            .filter((service) => choice.serviceIds.includes(service.id))
                            .map((service) => service.name)
                            .join(' · ')}
                        </p>
                      )}
                    </Card.Content>
                  </Card>
                )
              })}
              <Button variant="ghost" className="ob2-equipment-add" onPress={startCustom}>
                <Plus size={28} aria-hidden />
                <strong>Cadastrar outro aparelho alugado</strong>
                <span>Vincule serviços ou cadastre um novo atendimento.</span>
              </Button>
            </div>
            {!choices.length ? (
              <p className="ob2-copy">
                Nenhum aparelho sugerido para esta seleção. Você pode cadastrar o aparelho que
                utiliza.
              </p>
            ) : null}
            <p className="ob2-copy">
              Os serviços vinculados serão destacados com uma estrela dourada e configurados para
              liberação de datas.
            </p>
          </>
        )}
        {error ? (
          <p className="ob2-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </BlurDialog>
    </>
  )
}

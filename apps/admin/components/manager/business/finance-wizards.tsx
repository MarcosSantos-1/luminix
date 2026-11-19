'use client'

import { Button } from '@heroui/react'
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { DateInputField, maskMoney, SelectField, TextInputField } from '@/components/ui/fields'
import { QuickModal } from '../quick-modal'
import type { ClinicApi } from '../settings/clinic-api'
import { money, parseMoney } from './format'

export type BillLike = { id: string; name: string; category: string; amountCents: number }

/** Usual bills of a salon or clinic. */
export const billTemplates: {
  name: string
  category: string
  dueDay: number | null
  emoji: string
  hint: string
}[] = [
  { name: 'Aluguel', category: 'Aluguel', dueDay: 10, emoji: '🏠', hint: 'Ponto ou sala' },
  { name: 'Energia (luz)', category: 'Contas', dueDay: 15, emoji: '💡', hint: 'Conta de luz' },
  { name: 'Água', category: 'Contas', dueDay: 15, emoji: '💧', hint: 'Água e esgoto' },
  {
    name: 'Internet e telefone',
    category: 'Contas',
    dueDay: 10,
    emoji: '📶',
    hint: 'Wi-Fi e celular',
  },
  {
    name: 'Salários e comissões',
    category: 'Equipe',
    dueDay: 5,
    emoji: '👥',
    hint: 'Equipe e repasses',
  },
  {
    name: 'Impostos (DAS, MEI)',
    category: 'Impostos',
    dueDay: 20,
    emoji: '🧾',
    hint: 'Guia do mês',
  },
  { name: 'Contador', category: 'Serviços', dueDay: 5, emoji: '📊', hint: 'Contabilidade' },
  {
    name: 'Sistemas e assinaturas',
    category: 'Serviços',
    dueDay: 5,
    emoji: '💻',
    hint: 'Apps e plataformas',
  },
  { name: 'Limpeza', category: 'Serviços', dueDay: null, emoji: '🧹', hint: 'Faxina e produtos' },
  {
    name: 'Reposição de produtos',
    category: 'Produtos',
    dueDay: null,
    emoji: '🧴',
    hint: 'Compra do mês',
  },
]

export const expenseCategories = [
  'Aluguel',
  'Contas',
  'Produtos',
  'Equipe',
  'Marketing',
  'Equipamentos',
  'Impostos',
  'Serviços',
  'Outros',
]
const categoryEmoji: Record<string, string> = {
  Aluguel: '🏠',
  Contas: '🔌',
  Produtos: '🧴',
  Equipe: '👥',
  Marketing: '📣',
  Equipamentos: '🛠️',
  Impostos: '🧾',
  Serviços: '🤝',
  Outros: '📌',
  Atendimentos: '💇',
  Pacotes: '🎁',
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** The emoji of a bill: its template, else its category, else a pin. */
export function billEmoji(name: string, category: string) {
  return (
    billTemplates.find((template) => fold(template.name) === fold(name))?.emoji ??
    categoryEmoji[category] ??
    '📌'
  )
}
export const categoryIcon = (category: string) => categoryEmoji[category] ?? '📌'

const dueOptions = [
  { id: 'none', label: 'Sem dia certo' },
  ...Array.from({ length: 31 }, (_, index) => ({
    id: String(index + 1),
    label: `Todo dia ${index + 1}`,
  })),
]

type Pick = { key: string; name: string; category: string; dueDay: number | null; emoji: string }

/**
 * Contas fixas em duas etapas, com cards grandes: escolher (as já cadastradas aparecem marcadas e
 * travadas; "Outra conta" cria uma com nome e categoria) e depois valor médio e vencimento de
 * cada nova. Serve para a primeira visita e para "Nova conta".
 */
export function BillWizard({
  api,
  existing,
  firstTime,
  onClose,
}: {
  api: ClinicApi
  existing: BillLike[]
  firstTime: boolean
  onClose: (message?: string) => void
}) {
  const has = (name: string) => existing.some((bill) => fold(bill.name) === fold(name))
  const [step, setStep] = useState<1 | 2>(1)
  const [chosen, setChosen] = useState<string[]>(() =>
    existing.length ? [] : ['Aluguel', 'Energia (luz)', 'Água'],
  )
  const [custom, setCustom] = useState<Pick[]>([])
  const [adding, setAdding] = useState<{ name: string; category: string } | null>(null)
  const [values, setValues] = useState<Record<string, { amount: string; dueDay: string }>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const categories = [
    ...new Set([...expenseCategories, ...existing.map((bill) => bill.category)]),
  ].filter(Boolean)
  const picked: Pick[] = [
    ...billTemplates
      .filter((template) => chosen.includes(template.name))
      .map((template) => ({ key: template.name, ...template })),
    ...custom,
  ]
  const valueOf = (item: Pick) =>
    values[item.key] ?? { amount: '', dueDay: item.dueDay ? String(item.dueDay) : 'none' }

  function addCustom() {
    if (!adding?.name.trim()) return setError('Dê um nome para a conta.')
    if (has(adding.name) || picked.some((item) => fold(item.name) === fold(adding.name)))
      return setError('Essa conta já está na lista.')
    const category = adding.category.trim() || 'Outros'
    setCustom([
      ...custom,
      {
        key: `custom-${crypto.randomUUID()}`,
        name: adding.name.trim(),
        category,
        dueDay: null,
        emoji: categoryIcon(category),
      },
    ])
    setAdding(null)
    setError('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      for (const item of picked) {
        const value = valueOf(item)
        await api.put(`finance/bills/${crypto.randomUUID()}`, {
          name: item.name,
          category: item.category,
          amountCents: parseMoney(value.amount) ?? 0,
          dueDay: value.dueDay === 'none' ? null : Number(value.dueDay),
          status: 'active',
        })
      }
      onClose(
        `${picked.length} ${picked.length === 1 ? 'conta fixa criada' : 'contas fixas criadas'}. Elas aparecem todo mês para dar baixa.`,
      )
    } catch {
      setError('Não foi possível salvar todas as contas. Confira a lista e tente de novo.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      className="fw"
      title={firstTime ? '✨ Vamos organizar as contas do mês' : '➕ Nova conta fixa'}
      subtitle={
        <span className="fw-sub">
          <span className="fw-progress" aria-hidden>
            <i data-on />
            <i data-on={step === 2 || undefined} />
          </span>
          {step === 1
            ? 'Etapa 1 de 2 · Marque o que se repete todo mês no seu espaço.'
            : 'Etapa 2 de 2 · Um valor médio e o vencimento. Dá para mudar depois.'}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" className="qm-foot-start" onPress={() => onClose()}>
            {firstTime ? 'Agora não' : 'Cancelar'}
          </Button>
          {step === 2 ? (
            <Button variant="secondary" onPress={() => setStep(1)}>
              <ChevronLeft size={16} aria-hidden /> Voltar
            </Button>
          ) : null}
          {step === 1 ? (
            <Button isDisabled={!picked.length} onPress={() => setStep(2)}>
              Continuar {picked.length ? `(${picked.length})` : ''}{' '}
              <ChevronRight size={16} aria-hidden />
            </Button>
          ) : (
            <Button isDisabled={saving} onPress={() => void save()}>
              <Check size={16} aria-hidden />{' '}
              {saving
                ? 'Salvando…'
                : `Criar ${picked.length} ${picked.length === 1 ? 'conta' : 'contas'}`}
            </Button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <>
          <ul className="fw-grid">
            {billTemplates.map((template) => {
              const saved = has(template.name)
              const selected = saved || chosen.includes(template.name)
              return (
                <li key={template.name}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    disabled={saved}
                    className={saved ? 'is-saved' : undefined}
                    onClick={() =>
                      setChosen(
                        selected
                          ? chosen.filter((name) => name !== template.name)
                          : [...chosen, template.name],
                      )
                    }
                  >
                    <span className="fw-emoji" aria-hidden>
                      {template.emoji}
                    </span>
                    <strong>{template.name}</strong>
                    <small>{saved ? 'Já cadastrada' : template.hint}</small>
                    <i className="fw-check" aria-hidden>
                      {selected ? <Check size={13} strokeWidth={3} /> : null}
                    </i>
                  </button>
                </li>
              )
            })}
            {existing
              .filter(
                (bill) =>
                  !billTemplates.some((template) => fold(template.name) === fold(bill.name)),
              )
              .map((bill) => (
                <li key={bill.id}>
                  <button type="button" role="checkbox" aria-checked disabled className="is-saved">
                    <span className="fw-emoji" aria-hidden>
                      {billEmoji(bill.name, bill.category)}
                    </span>
                    <strong>{bill.name}</strong>
                    <small>Já cadastrada</small>
                    <i className="fw-check" aria-hidden>
                      <Check size={13} strokeWidth={3} />
                    </i>
                  </button>
                </li>
              ))}
            {custom.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked
                  onClick={() => setCustom(custom.filter((entry) => entry.key !== item.key))}
                >
                  <span className="fw-emoji" aria-hidden>
                    {item.emoji}
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.category} · nova</small>
                  <i className="fw-check" aria-hidden>
                    <Check size={13} strokeWidth={3} />
                  </i>
                </button>
              </li>
            ))}
            {adding ? null : (
              <li>
                <button
                  type="button"
                  className="fw-add"
                  onClick={() => setAdding({ name: '', category: 'Outros' })}
                >
                  <span className="fw-emoji" aria-hidden>
                    <Plus size={22} />
                  </span>
                  <strong>Outra conta</strong>
                  <small>Crie a sua</small>
                </button>
              </li>
            )}
          </ul>
          {adding ? (
            <div className="fw-custom">
              <div className="fw-custom-head">
                <strong>📝 Nova conta</strong>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label="Fechar"
                  onPress={() => setAdding(null)}
                >
                  <X size={16} />
                </Button>
              </div>
              <TextInputField
                label="Nome"
                autoFocus
                maxLength={80}
                placeholder="Ex.: Plano de saúde, estacionamento"
                value={adding.name}
                onEnter={addCustom}
                onChange={(name) => setAdding({ ...adding, name })}
              />
              <span className="fw-label">Categoria</span>
              <div className="biz-chips" role="radiogroup" aria-label="Categoria">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    role="radio"
                    aria-checked={adding.category === category}
                    onClick={() => setAdding({ ...adding, category })}
                  >
                    {categoryIcon(category)} {category}
                  </button>
                ))}
              </div>
              <TextInputField
                label="Ou crie uma categoria"
                maxLength={60}
                placeholder="Ex.: Transporte"
                value={categories.includes(adding.category) ? '' : adding.category}
                onChange={(category) => setAdding({ ...adding, category })}
              />
              <div className="fw-custom-foot">
                <Button size="sm" onPress={addCustom}>
                  <Plus size={14} aria-hidden /> Adicionar à lista
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <ul className="fw-values">
          {picked.map((item) => {
            const value = valueOf(item)
            const set = (patch: Partial<typeof value>) =>
              setValues({ ...values, [item.key]: { ...value, ...patch } })
            return (
              <li key={item.key}>
                <span className="fw-emoji is-small" aria-hidden>
                  {item.emoji}
                </span>
                <span className="fw-values-name">
                  <strong>{item.name}</strong>
                  <small>{item.category}</small>
                </span>
                <TextInputField
                  ariaLabel={`Valor médio de ${item.name}`}
                  prefix="R$"
                  inputMode="numeric"
                  placeholder="Valor médio"
                  value={value.amount}
                  onChange={(amount) => set({ amount: maskMoney(amount) })}
                />
                <SelectField
                  ariaLabel={`Vencimento de ${item.name}`}
                  value={value.dueDay}
                  onChange={(dueDay) => set({ dueDay })}
                  options={dueOptions}
                />
              </li>
            )
          })}
        </ul>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

const methodChoices = [
  { id: 'pix', label: 'Pix', emoji: '⚡' },
  { id: 'cash', label: 'Dinheiro', emoji: '💵' },
  { id: 'credit', label: 'Crédito', emoji: '💳' },
  { id: 'debit', label: 'Débito', emoji: '🏧' },
  { id: 'transfer', label: 'Transferência', emoji: '🏦' },
  { id: 'other', label: 'Outro', emoji: '➕' },
]
const incomeCategories = ['Atendimentos', 'Produtos', 'Pacotes', 'Outros']
const shiftDay = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/**
 * Nova entrada / saída, uma pergunta por vez: o que foi (entrada ou saída), quanto e de que
 * tipo, e os detalhes (descrição, quando, como pagou), com o resumo em destaque.
 */
export function EntryWizard({
  api,
  kind,
  today,
  onClose,
}: {
  api: ClinicApi
  kind: 'income' | 'expense'
  today: string
  onClose: (message?: string) => void
}) {
  const [type, setType] = useState(kind)
  const [step, setStep] = useState<'amount' | 'details'>('amount')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(kind === 'expense' ? 'Produtos' : 'Atendimentos')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState('pix')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const cents = parseMoney(amount)
  const categories = type === 'expense' ? expenseCategories : incomeCategories

  function next() {
    if (!cents) return setError('Quanto foi? Digite o valor.')
    setError('')
    setStep('details')
  }

  async function save() {
    if (!cents) return setStep('amount')
    if (!description.trim()) return setError('Escreva uma descrição curta.')
    setSaving(true)
    setError('')
    try {
      await api.post('finance/entries', {
        kind: type,
        amountCents: cents,
        occurredOn: date,
        description: description.trim(),
        category: category.trim() || 'Outros',
        method,
      })
      onClose(`${type === 'income' ? 'Entrada' : 'Saída'} de ${money(cents)} registrada.`)
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className={`fw fw-entry is-${type}`}
      title={type === 'income' ? '💰 Nova entrada' : '💸 Nova saída'}
      subtitle={
        <span className="fw-sub">
          <span className="fw-progress" aria-hidden>
            <i data-on />
            <i data-on={step === 'details' || undefined} />
          </span>
          {step === 'amount' ? 'Quanto e de quê' : 'Os detalhes'}
        </span>
      }
      footer={
        <>
          {step === 'details' ? (
            <Button variant="ghost" onPress={() => setStep('amount')}>
              <ChevronLeft size={16} aria-hidden /> Voltar
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => onClose()}>
              Cancelar
            </Button>
          )}
          {step === 'amount' ? (
            <Button onPress={next}>
              Continuar <ChevronRight size={16} aria-hidden />
            </Button>
          ) : (
            <Button isDisabled={saving} onPress={() => void save()}>
              <Check size={16} aria-hidden /> {saving ? 'Salvando…' : 'Registrar'}
            </Button>
          )}
        </>
      }
    >
      {step === 'amount' ? (
        <div className="fw-step">
          <div className="fw-kind" role="radiogroup" aria-label="Tipo">
            {(
              [
                ['income', '💰', 'Entrou dinheiro', 'Recebi de alguém'],
                ['expense', '💸', 'Saiu dinheiro', 'Paguei alguma coisa'],
              ] as const
            ).map(([id, emoji, label, hint]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={type === id}
                className={`is-${id}`}
                onClick={() => {
                  setType(id)
                  setCategory(id === 'expense' ? 'Produtos' : 'Atendimentos')
                }}
              >
                <span className="fw-emoji is-small">{emoji}</span>
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </button>
            ))}
          </div>
          <TextInputField
            className="fw-amount"
            label="Valor"
            autoFocus
            prefix="R$"
            inputMode="numeric"
            placeholder="0,00"
            value={amount}
            onEnter={next}
            onChange={(text) => setAmount(maskMoney(text))}
          />
          <span className="fw-label">{type === 'income' ? 'De onde veio?' : 'Com o quê?'}</span>
          <div className="fw-cats" role="radiogroup" aria-label="Categoria">
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={category === name}
                onClick={() => setCategory(name)}
              >
                <span aria-hidden>{categoryIcon(name)}</span> {name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fw-step">
          <div className={`fw-total is-${type}`}>
            <span aria-hidden>{type === 'income' ? '💰' : '💸'}</span>
            <strong>
              {type === 'income' ? '+' : '−'} {money(cents ?? 0)}
            </strong>
            <small>
              {categoryIcon(category)} {category}
            </small>
          </div>
          <TextInputField
            label="Descrição"
            autoFocus
            maxLength={160}
            value={description}
            placeholder={
              type === 'income' ? 'Ex.: Venda de hidratante' : 'Ex.: Conserto do ar-condicionado'
            }
            onChange={setDescription}
          />
          <span className="fw-label">Quando?</span>
          <div className="biz-chips" role="radiogroup" aria-label="Quando">
            {[
              [today, 'Hoje'],
              [shiftDay(today, -1), 'Ontem'],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={date === value}
                onClick={() => setDate(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <DateInputField
            ariaLabel="Outra data"
            value={date}
            max={today}
            onChange={(value) => setDate(value || today)}
          />
          <span className="fw-label">Como foi pago?</span>
          <div className="fw-methods" role="radiogroup" aria-label="Forma de pagamento">
            {methodChoices.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={method === item.id}
                onClick={() => setMethod(item.id)}
              >
                <span aria-hidden>{item.emoji}</span> {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

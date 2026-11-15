import { ArrowRight, Check } from 'lucide-react'
import { adminUrl } from '../../lib/admin-url'
import { PLAN_MONTHLY_PRICE, PLAN_YEARLY_PRICE, TRIAL_DAYS, formatBRL } from '../../lib/site'

const included = [
  'Todos os módulos do sistema',
  'Acesso no celular e no computador',
  'Página do seu espaço',
  'Suporte com gente de verdade',
]

function Price({ value }: { value: number }) {
  const [whole, cents] = formatBRL(value).replace('R$', '').trim().split(',')
  return (
    <p className="lp-price">
      <small>R$</small>
      <b>{whole}</b>
      <span>,{cents}</span>
    </p>
  )
}

/** Seção de planos. Valores vêm de lib/site.ts. */
export function Pricing({ id = 'planos' }: { id?: string }) {
  const yearlyPerMonth = PLAN_YEARLY_PRICE / 12
  const saving = Math.round((1 - PLAN_YEARLY_PRICE / (PLAN_MONTHLY_PRICE * 12)) * 100)

  return (
    <section className="lp-section lp-pricing" id={id} aria-labelledby={`${id}-title`}>
      <div className="lp-heading">
        <p className="lp-kicker">Planos</p>
        <h2 id={`${id}-title`}>Um preço. Tudo incluso.</h2>
        <p className="lp-lead">
          Comece com {TRIAL_DAYS} dias grátis, sem cartão. Depois, pague no Pix ou no cartão.
        </p>
      </div>
      <div className="lp-plans">
        <article className="lp-plan">
          <h3>Mensal</h3>
          <Price value={PLAN_MONTHLY_PRICE} />
          <p className="lp-plan-note">por mês, no Pix ou no cartão</p>
          <a className="lp-btn lp-btn-outline" href={adminUrl('/cadastro')}>
            Começar grátis <ArrowRight size={18} aria-hidden />
          </a>
        </article>
        <article className="lp-plan lp-plan-featured">
          <span className="lp-plan-badge">Economize {saving}%</span>
          <h3>Anual</h3>
          <Price value={PLAN_YEARLY_PRICE} />
          <p className="lp-plan-note">por ano — sai a {formatBRL(yearlyPerMonth)} por mês</p>
          <a className="lp-btn lp-btn-light" href={adminUrl('/cadastro')}>
            Começar grátis <ArrowRight size={18} aria-hidden />
          </a>
        </article>
        <ul className="lp-plan-included">
          <li>
            <strong>Nos dois planos</strong>
          </li>
          {included.map((item) => (
            <li key={item}>
              <Check size={15} aria-hidden /> {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

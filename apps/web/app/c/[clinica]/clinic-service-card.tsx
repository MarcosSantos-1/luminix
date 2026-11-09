import Image from 'next/image'
import { Clock3, Flower2 } from 'lucide-react'
import { serviceCategoryArt } from '../../../lib/clinic-categories'
import type { PublicService } from '../../../lib/public-clinic'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function ClinicServiceCard({
  service,
  photoUrl,
  showCategory = false,
}: {
  service: PublicService
  photoUrl?: string | null
  showCategory?: boolean
}) {
  const art = photoUrl || serviceCategoryArt(service)
  return (
    <article className="clinic-service">
      <div
        className={`clinic-service-mark${photoUrl ? '' : ' clinic-service-illustration'}`}
        aria-hidden="true"
      >
        {art ? (
          <Image src={art} alt="" width={112} height={112} unoptimized />
        ) : (
          <Flower2 size={26} strokeWidth={1.35} />
        )}
      </div>
      <div className="clinic-service-copy">
        {showCategory && <span className="clinic-service-category">{service.category}</span>}
        {service.promoPercent ? (
          <span className="clinic-service-badge">
            -{service.promoPercent}%
            {service.promoEndsOn
              ? ` até ${service.promoEndsOn.slice(8, 10)}/${service.promoEndsOn.slice(5, 7)}`
              : ''}
          </span>
        ) : null}
        <h3>{service.name}</h3>
        {service.description && <p>{service.description}</p>}
        <div className="clinic-service-meta">
          <span>
            <Clock3 size={14} aria-hidden />
            {service.durationMinutes} min
          </span>
          {service.priceType !== 'quote' && service.promoPriceCents != null ? (
            <span className="clinic-service-promo">
              <s aria-label={`De ${money.format(service.priceCents / 100)}`}>
                {money.format(service.priceCents / 100)}
              </s>
              <strong>
                {service.priceType === 'from' ? 'A partir de ' : ''}
                {money.format(service.promoPriceCents / 100)}
              </strong>
            </span>
          ) : (
            <strong>
              {service.priceType === 'quote'
                ? 'Sob consulta'
                : `${service.priceType === 'from' ? 'A partir de ' : ''}${money.format(service.priceCents / 100)}`}
            </strong>
          )}
        </div>
        {service.bookingMode === 'manual_release' && (
          <small>Disponibilidade sob consulta com a equipe.</small>
        )}
      </div>
    </article>
  )
}

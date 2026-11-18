import { downloadBlob, workbook } from '@/lib/xlsx'
import { priceLabel, type Service } from './catalog-model'
import { money } from './format'

export type PricePackage = {
  name: string
  serviceId: string
  sessions: number
  priceCents: number
  validityDays: number | null
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )

function slug(text: string) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'espaco'
  )
}

function grouped(services: Service[]) {
  const active = services.filter((service) => service.status === 'active')
  return [...new Set(active.map((service) => service.category))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((category) => ({
      category,
      items: active
        .filter((service) => service.category === category)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }))
}

function duration(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
    : `${minutes} min`
}

/** Excel with one sheet for services and one for packages. */
export function downloadPriceSheet(
  services: Service[],
  packages: PricePackage[],
  clinicName: string,
) {
  const rows = grouped(services).flatMap(({ category, items }) =>
    items.map((service) => [
      category,
      service.name,
      service.priceType === 'quote'
        ? 'Sob consulta'
        : service.priceType === 'from'
          ? 'A partir de'
          : 'Valor fixo',
      service.priceType === 'quote' ? null : { money: service.priceCents },
      service.promotion?.priceCents != null && service.priceType !== 'quote'
        ? { money: service.promotion.priceCents }
        : null,
      service.durationMinutes,
      service.description || null,
    ]),
  )
  const name = (id: string) => services.find((service) => service.id === id)?.name ?? ''
  const blob = workbook([
    {
      name: 'Serviços',
      widths: [22, 36, 14, 14, 16, 12, 60],
      rows: [
        [
          'Categoria',
          'Serviço',
          'Tipo de preço',
          'Preço',
          'Preço promocional',
          'Duração (min)',
          'Descrição',
        ],
        ...rows,
      ],
    },
    {
      name: 'Pacotes',
      widths: [36, 30, 10, 14, 16, 16],
      rows: [
        ['Pacote', 'Serviço', 'Sessões', 'Preço', 'Por sessão', 'Validade (dias)'],
        ...packages.map((item) => [
          item.name,
          name(item.serviceId),
          item.sessions,
          { money: item.priceCents },
          { money: Math.round(item.priceCents / item.sessions) },
          item.validityDays,
        ]),
      ],
    },
  ])
  downloadBlob(blob, `tabela-de-precos-${slug(clinicName)}.xlsx`)
}

/**
 * A printable, styled price table in a new tab; the browser's "Salvar como PDF" makes the file.
 * Uses the space's accent so it feels like the clinic's own material.
 */
export function priceTableHtml(
  services: Service[],
  packages: PricePackage[],
  clinicName: string,
  accent = '#ec287a',
) {
  const today = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())
  const name = (id: string) => services.find((service) => service.id === id)?.name ?? ''
  const sections = grouped(services)
    .map(
      ({ category, items }) => `
      <section>
        <h2>${escapeHtml(category)}</h2>
        <ul>
          ${items
            .map((service) => {
              const promo =
                service.promotion?.priceCents != null && service.priceType !== 'quote'
                  ? service.promotion.priceCents
                  : null
              return `<li>
                <div><strong>${escapeHtml(service.name)}</strong>${
                  service.description ? `<small>${escapeHtml(service.description)}</small>` : ''
                }</div>
                <span class="dots"></span>
                <span class="time">${duration(service.durationMinutes)}</span>
                <span class="price">${
                  promo != null
                    ? `<s>${money(service.priceCents)}</s> ${escapeHtml(priceLabel(service, promo))}`
                    : escapeHtml(priceLabel(service))
                }</span>
              </li>`
            })
            .join('')}
        </ul>
      </section>`,
    )
    .join('')
  const packs = packages.length
    ? `<section class="packs"><h2>Pacotes</h2><div class="pack-grid">${packages
        .map(
          (item) => `<article>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(name(item.serviceId))} · ${item.sessions} sessões${
              item.validityDays ? ` · validade ${item.validityDays} dias` : ''
            }</small>
            <b>${money(item.priceCents)}</b>
            <em>${money(Math.round(item.priceCents / item.sessions))} por sessão</em>
          </article>`,
        )
        .join('')}</div></section>`
    : ''
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Tabela de preços · ${escapeHtml(clinicName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #2a1720; font: 13px/1.45 Inter, system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    header { padding: 28px 30px; border-radius: 22px; color: #fff; background: linear-gradient(135deg, ${accent}, #2a1720); }
    header small { opacity: .8; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }
    header h1 { margin: 6px 0 2px; font: 600 34px/1.1 Fraunces, Georgia, serif; }
    header p { margin: 0; opacity: .85; }
    main { padding: 6px 4px; }
    section { margin-top: 22px; break-inside: avoid-page; }
    h2 { margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid ${accent}; color: ${accent}; font: 600 19px Fraunces, Georgia, serif; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { display: flex; align-items: baseline; gap: 10px; padding: 7px 0; break-inside: avoid; }
    li div { display: grid; max-width: 62%; }
    li small { color: #8a7480; font-size: 11px; }
    .dots { flex: 1; border-bottom: 1px dotted #d6c4cc; transform: translateY(-4px); }
    .time { color: #8a7480; font-size: 11.5px; white-space: nowrap; }
    .price { min-width: 92px; font-weight: 600; text-align: right; white-space: nowrap; }
    .price s { color: #a8939d; font-weight: 400; margin-right: 4px; }
    .pack-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    article { display: grid; gap: 2px; padding: 14px 16px; border: 1px solid #ecdde4; border-radius: 16px; break-inside: avoid; background: #fdf7fa; }
    article small { color: #8a7480; }
    article b { margin-top: 6px; color: ${accent}; font-size: 18px; }
    article em { color: #8a7480; font-size: 11.5px; font-style: normal; }
    footer { margin-top: 26px; color: #a8939d; font-size: 11px; text-align: center; }
    .print { position: fixed; right: 18px; bottom: 18px; padding: 12px 20px; border: 0; border-radius: 999px; color: #fff; background: ${accent}; font: 600 14px Inter, sans-serif; cursor: pointer; box-shadow: 0 10px 30px #0003; }
    @media print { .print { display: none; } }
  </style></head><body>
  <header><small>Tabela de preços</small><h1>${escapeHtml(clinicName)}</h1><p>Atualizada em ${today}</p></header>
  <main>${sections}${packs}</main>
  <footer>Valores sujeitos a alteração · Gerado pelo Luminix</footer>
  <button class="print" onclick="window.print()">Salvar como PDF</button>
  </body></html>`
  return html
}

export function openPricePdf(
  services: Service[],
  packages: PricePackage[],
  clinicName: string,
  accent = '#ec287a',
) {
  const html = priceTableHtml(services, packages, clinicName, accent)
  const page = window.open('', '_blank')
  if (!page) return false
  page.document.open()
  page.document.write(html)
  page.document.close()
  page.addEventListener('load', () => window.setTimeout(() => page.print(), 350))
  return true
}

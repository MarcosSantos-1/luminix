import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { Brand } from '../../../components/brand'
import { Pricing } from '../../../components/landing/pricing'
import { SupportFab } from '../../../components/landing/support-fab'
import { VideoButton } from '../../../components/landing/video-button'
import { adPages, findAdPage } from '../../../lib/ad-pages'
import { adminUrl } from '../../../lib/admin-url'
import { modules } from '../../../lib/modules'
import { TRIAL_DAYS } from '../../../lib/site'
import '../../landing.css'
import '../ads.css'

type Params = Promise<{ nicho: string }>

export const dynamicParams = false

export function generateStaticParams() {
  return adPages.map((page) => ({ nicho: page.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = findAdPage((await params).nicho)
  if (!page) return {}
  return { title: page.metaTitle, description: page.metaDescription }
}

/**
 * Página de destino para anúncios: sem menu, uma promessa, um botão.
 * O conteúdo de cada público fica em lib/ad-pages.ts.
 */
export default async function AdLandingPage({ params }: { params: Params }) {
  const page = findAdPage((await params).nicho)
  if (!page) notFound()

  const dark = page.theme === 'graphite'
  const trialLabel = `Testar ${TRIAL_DAYS} dias grátis`
  const signup = adminUrl('/cadastro')

  return (
    <div className="lp ad" data-theme={page.theme}>
      <header className="ad-top">
        <Link href="/" aria-label="Luminix — início">
          <Brand variant={dark ? 'white' : 'default'} />
        </Link>
        <a className="lp-btn lp-btn-primary lp-btn-sm" href={signup}>
          Testar grátis
        </a>
      </header>

      <main id="conteudo">
        <section className="lp-hero" id="inicio" aria-labelledby="ad-title">
          <div className="lp-hero-copy">
            <p className="lp-kicker">{page.kicker}</p>
            <h1 id="ad-title">
              {page.title} <span className="lp-mark">{page.titleMark}</span>
            </h1>
            <p className="lp-lead">{page.lead}</p>
            <div className="lp-hero-actions">
              <a className="lp-btn lp-btn-primary" href={signup}>
                {trialLabel} <ArrowRight size={18} aria-hidden />
              </a>
              <VideoButton>Ver em 2 minutos</VideoButton>
            </div>
            <ul className="lp-hero-notes">
              <li>
                <Check size={15} aria-hidden /> Sem cartão
              </li>
              <li>
                <Check size={15} aria-hidden /> Pix ou cartão depois
              </li>
            </ul>
          </div>
          <div className="lp-hero-visual">
            <span className="lp-dots lp-hero-dots" aria-hidden />
            <span className="lp-hero-block" aria-hidden />
            <div className="lp-hero-photo">
              <Image
                src={page.hero.src}
                alt={page.hero.alt}
                width={page.hero.width}
                height={page.hero.height}
                style={{ objectPosition: page.hero.position }}
                priority
                sizes="(min-width: 960px) 46vw, 92vw"
              />
            </div>
            {page.chips.map((chip, index) => (
              <div className={`lp-chip ad-chip ad-chip-${index + 1}`} key={chip.label} aria-hidden>
                <span className="lp-chip-dot" />
                <span>
                  <b>{chip.label}</b>
                  {chip.text}
                </span>
              </div>
            ))}
            <a className="lp-sticker" href={signup} aria-label={trialLabel}>
              <b>{TRIAL_DAYS}</b>
              <span>
                dias
                <br />
                grátis
              </span>
            </a>
          </div>
        </section>

        <section className="lp-section ad-pains" aria-label="O que o Luminix resolve">
          {page.pains.map((pain, index) => (
            <article key={pain.title}>
              <span aria-hidden>{index + 1}</span>
              <h2>{pain.title}</h2>
              <p>{pain.text}</p>
            </article>
          ))}
        </section>

        <section className="lp-section ad-band" aria-labelledby="band-title">
          <div className="ad-band-photo">
            <span className="lp-dots" aria-hidden />
            <Image
              src={page.band.image.src}
              alt={page.band.image.alt}
              width={page.band.image.width}
              height={page.band.image.height}
              sizes="(min-width: 960px) 40vw, 92vw"
            />
          </div>
          <div>
            <h2 id="band-title">{page.band.title}</h2>
            <p className="lp-lead">{page.band.text}</p>
            <ul className="ad-points">
              {page.band.points.map((point) => (
                <li key={point}>
                  <Check size={15} aria-hidden /> {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section ad-modules" aria-labelledby="modules-title">
          <p className="lp-kicker">Tudo em um sistema</p>
          <h2 id="modules-title">Muito além da agenda.</h2>
          <ul className="lp-modules">
            {modules.map((module) => (
              <li key={module.name} data-soon={module.soon || undefined}>
                {module.name}
                {module.soon && <i>em breve</i>}
              </li>
            ))}
          </ul>
        </section>

        <Pricing />

        <section className="lp-section lp-faq ad-faq" aria-labelledby="ad-faq-title">
          <h2 id="ad-faq-title">Antes de começar</h2>
          <div className="lp-faq-list">
            {page.faq.map((item) => (
              <details key={item.question} name="faq">
                <summary>
                  {item.question}
                  <span aria-hidden />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ad-final" aria-labelledby="ad-final-title">
          <h2 id="ad-final-title">Comece hoje. Decida em {TRIAL_DAYS} dias.</h2>
          <a className="lp-btn lp-btn-light" href={signup}>
            {trialLabel} <ArrowRight size={18} aria-hidden />
          </a>
          <p>Sem cartão para começar.</p>
        </section>
      </main>

      <footer className="ad-foot">
        <span>© {new Date().getFullYear()} Luminix</span>
        <Link href="/">Conhecer o site</Link>
        <Link href="/termos">Termos</Link>
        <Link href="/privacidade">Privacidade</Link>
      </footer>
      <SupportFab afterId="inicio" />
    </div>
  )
}

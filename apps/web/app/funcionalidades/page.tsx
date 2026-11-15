import type { Metadata } from 'next'
import Image from 'next/image'
import { ArrowRight, Check, ImagePlay } from 'lucide-react'
import { LandingHeader } from '../../components/landing/landing-header'
import { LandingFooter } from '../../components/landing/landing-footer'
import { SupportFab } from '../../components/landing/support-fab'
import { FeaturesNav } from '../../components/landing/features-nav'
import { adminUrl } from '../../lib/admin-url'
import { featureGroups, type Feature } from '../../lib/features'
import { TRIAL_DAYS } from '../../lib/site'
import '../landing.css'
import './docs.css'

export const metadata: Metadata = {
  title: 'Funcionalidades',
  description: 'Tudo o que o Luminix faz pelo seu espaço, explicado tópico por tópico.',
}

function Media({ feature }: { feature: Feature }) {
  const media = feature.media
  if (!media) {
    return (
      <div className="docs-media docs-media-empty">
        <ImagePlay size={22} aria-hidden />
        <span>Demonstração em breve</span>
      </div>
    )
  }
  if (media.type === 'video') {
    return (
      <div className="docs-media">
        <iframe src={media.src} title={media.title} loading="lazy" allowFullScreen />
      </div>
    )
  }
  return (
    <div className="docs-media">
      <Image
        src={media.src}
        alt={media.alt}
        width={1400}
        height={933}
        sizes="(min-width: 960px) 760px, 92vw"
        unoptimized={media.type === 'gif'}
      />
    </div>
  )
}

export default function FeaturesPage() {
  return (
    <div className="lp docs">
      <LandingHeader />
      <div className="docs-layout">
        <FeaturesNav groups={featureGroups} />
        <main id="conteudo" className="docs-main">
          <header className="docs-intro">
            <p className="lp-kicker">Funcionalidades</p>
            <h1>O que o Luminix faz, tópico por tópico.</h1>
            <p className="lp-lead">
              Explicações curtas de cada parte do sistema. O que ainda está chegando aparece marcado
              como “em breve”.
            </p>
          </header>

          {featureGroups.map((group) => (
            <section key={group.title} className="docs-group" aria-label={group.title}>
              <p className="docs-group-title">{group.title}</p>
              {group.features.map((feature) => (
                <article key={feature.id} id={feature.id} className="docs-article">
                  <div className="docs-article-head">
                    <h2>{feature.title}</h2>
                    <span className="docs-status" data-status={feature.status}>
                      {feature.status === 'disponivel' ? 'Disponível' : 'Em breve'}
                    </span>
                  </div>
                  <p className="docs-summary">{feature.summary}</p>
                  <Media feature={feature} />
                  <ul className="docs-points">
                    {feature.points.map((point) => (
                      <li key={point}>
                        <Check size={15} aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                  {feature.faq && (
                    <div className="docs-faq">
                      {feature.faq.map((item) => (
                        <details key={item.question}>
                          <summary>{item.question}</summary>
                          <p>{item.answer}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}

          <aside className="docs-cta">
            <div>
              <h2>Melhor que ler é usar.</h2>
              <p>Teste com a sua agenda por {TRIAL_DAYS} dias.</p>
            </div>
            <a className="lp-btn lp-btn-light" href={adminUrl('/cadastro')}>
              Testar {TRIAL_DAYS} dias grátis <ArrowRight size={18} aria-hidden />
            </a>
          </aside>
        </main>
      </div>
      <LandingFooter />
      <SupportFab />
    </div>
  )
}

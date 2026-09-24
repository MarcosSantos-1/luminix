import Link from 'next/link'
import { ArrowRight, Bell, Check, Sparkles } from 'lucide-react'

import { Brand } from '../components/brand'
import { adminUrl } from '../lib/admin-url'

const chartHeights = [35, 52, 42, 68, 55, 86, 73]

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-glow" />
      <header className="landing-header">
        <Brand variant="white" />
        <div className="header-links">
          <Link href="/acesso" className="login-link">
            Acesso do cliente
          </Link>
          <a href={adminUrl('/login')} className="login-link">
            Já tenho uma conta <ArrowRight size={15} />
          </a>
        </div>
      </header>
      <div className="landing-body">
        <div className="landing-copy">
          <span className="eyebrow">
            <Sparkles size={14} /> Gestão que cuida de você
          </span>
          <h1>
            Sua clínica,
            <br />
            <em>mais simples.</em>
          </h1>
          <p>Agende, organize, atenda e encante seus clientes em um só lugar.</p>
          <div className="landing-actions">
            <a href={adminUrl('/cadastro')} className="button button-primary">
              Começar agora <ArrowRight size={18} />
            </a>
            <Link href="/c/demonstracao" className="play-link">
              <span>▶</span> Ver como funciona
            </Link>
          </div>
          <div className="trust-line">
            <div className="avatar-stack">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span>+2.000 clínicas já simplificaram sua rotina</span>
          </div>
        </div>
        <div className="hero-preview">
          <div className="preview-window">
            <div className="preview-top">
              <span className="dot pink" />
              <span className="dot" />
              <span className="dot" />
              <span className="preview-title">Visão geral</span>
              <span className="preview-date">Hoje, 15 de maio</span>
            </div>
            <div className="preview-welcome">
              <div>
                <small>Bom dia, Marcos</small>
                <h3>Como está sua clínica hoje?</h3>
              </div>
              <div className="preview-avatar">M</div>
            </div>
            <div className="preview-stats">
              <div>
                <span>Receita do mês</span>
                <strong>R$ 24.580</strong>
                <b>+12,5%</b>
              </div>
              <div>
                <span>Atendimentos</span>
                <strong>148</strong>
                <b>+8,2%</b>
              </div>
            </div>
            <div className="preview-chart">
              <div className="chart-label">
                <span>Receita semanal</span>
                <small>Últimos 7 dias</small>
              </div>
              <div className="bars">
                {chartHeights.map((height, index) => (
                  <i
                    style={{ height: `${height}%` }}
                    className={index === 5 ? 'active' : ''}
                    key={`${height}-${index}`}
                  />
                ))}
              </div>
            </div>
            <div className="preview-agenda">
              <span>Próximos atendimentos</span>
              <div className="agenda-item">
                <b>16:00</b>
                <span>
                  Camila Santos<small>Limpeza de pele</small>
                </span>
                <i>CS</i>
              </div>
              <div className="agenda-item">
                <b>17:30</b>
                <span>
                  Juliana Lima<small>Massagem relaxante</small>
                </span>
                <i>JL</i>
              </div>
            </div>
          </div>
          <div className="floating-note">
            <Bell size={17} />
            <span>
              <b>Você tem 3 lembretes</b>
              <small>para hoje</small>
            </span>
          </div>
        </div>
      </div>
      <footer className="landing-footer">
        <span>
          <Check size={15} /> Sem cartão de crédito
        </span>
        <span>
          <Check size={15} /> Configuração em 5 minutos
        </span>
        <span>
          <Check size={15} /> Suporte de verdade
        </span>
      </footer>
    </main>
  )
}

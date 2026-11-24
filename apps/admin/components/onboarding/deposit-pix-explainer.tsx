import { BadgeCheck, CalendarClock, Clock3, Home, QrCode, Smartphone } from 'lucide-react'

/**
 * How the Pix deposit works without Stripe (ADR-037), shown when the manager turns it on in
 * the onboarding or in Settings. The important part is where the deposit is confirmed.
 */
export function DepositPixExplainer({ holdLabel = '2 h' }: { holdLabel?: string }) {
  const steps = [
    {
      icon: CalendarClock,
      title: 'A cliente agenda pelo site',
      text: `O horário fica reservado por até ${holdLabel} enquanto ela paga o sinal.`,
    },
    {
      icon: QrCode,
      title: 'Ela paga no seu Pix',
      text: 'Recebe um Pix copia e cola com o valor certo, direto para a sua chave. O dinheiro cai na sua conta: o Luminix não passa por ele nem cobra taxa.',
    },
    {
      icon: Smartphone,
      title: 'Ela avisa que pagou',
      text: 'Toca em “Já paguei”. A partir daí o horário fica guardado até você conferir.',
    },
    {
      icon: BadgeCheck,
      title: 'Você confere e confirma',
      text: 'Veja no extrato do seu banco e toque em “Confirmar sinal recebido”. O valor é descontado do total do atendimento.',
    },
    {
      icon: Clock3,
      title: 'Não pagou no prazo?',
      text: 'O horário é liberado sozinho e a cliente vê que a reserva expirou.',
    },
  ]
  return (
    <div className="deposit-explainer">
      <ol>
        {steps.map(({ icon: Icon, title, text }, index) => (
          <li key={title}>
            <span className="deposit-explainer-icon" aria-hidden>
              <Icon size={18} />
              <b>{index + 1}</b>
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </li>
        ))}
      </ol>
      <div className="deposit-explainer-where">
        <Home size={18} aria-hidden />
        <span>
          <strong>Onde confirmar</strong>
          <small>
            Na página <b>Início</b>, o aviso <b>“Sinais para conferir”</b> aparece sempre que houver
            sinal pendente, com a lista e o botão de confirmar. Também dá para abrir o atendimento
            na agenda: ele aparece como “Aguardando sinal” ou “Sinal informado”.
          </small>
        </span>
      </div>
      <p className="deposit-explainer-note">
        Confira os sinais todos os dias. Prefere confirmação automática? Ative o recebimento pelo
        app (Stripe) em Pagamentos: aí não precisa de chave Pix.
      </p>
    </div>
  )
}

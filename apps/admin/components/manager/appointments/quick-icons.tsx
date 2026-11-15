import type { SVGProps } from 'react'

/** Line icons drawn for the quick actions of Início: no background, a second tone on the detail. */
function Frame(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="quick-icon"
      {...props}
    />
  )
}

export function NewBookingIcon() {
  return (
    <Frame>
      <path d="M36 21V12a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v21a3 3 0 0 0 3 3h13" />
      <path d="M6 17h30M14 5v7M28 5v7" />
      <path d="M12 23h4M20 23h4M12 29h4" opacity=".55" />
      <circle className="quick-icon-accent" cx="33" cy="33" r="7.5" />
      <path className="quick-icon-accent" d="M33 29.5v7M29.5 33h7" />
    </Frame>
  )
}

export function WeekAgendaIcon() {
  return (
    <Frame>
      <rect x="5" y="8" width="34" height="29" rx="3.5" />
      <path d="M5 16h34M13 4.5V11M31 4.5V11" />
      <path d="M16.3 16v21M27.6 16v21" opacity=".45" />
      <path
        className="quick-icon-accent"
        d="M9 21.5h4M9 26.5h4M20 23h4M20 31h4M31 21.5h4"
        strokeWidth="2.6"
      />
    </Frame>
  )
}

export function AddClientIcon() {
  return (
    <Frame>
      <circle cx="18" cy="14" r="7" />
      <path d="M5 38c0-7.2 5.8-13 13-13 2.6 0 5 .76 7 2.07" />
      <circle className="quick-icon-accent" cx="33" cy="32" r="7.5" />
      <path className="quick-icon-accent" d="M33 28.5v7M29.5 32h7" />
    </Frame>
  )
}

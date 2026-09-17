export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`brand ${dark ? 'brand-dark' : ''}`}>
      <span className="brand-mark">L</span>
      <span>Luminix</span>
    </div>
  )
}

import Image from 'next/image'
import logoLetter from '../../../assets/brand/logos/logo_letter.png'

export function Brand() {
  return (
    <div className="brand">
      <Image src={logoLetter} alt="Luminix" priority />
    </div>
  )
}

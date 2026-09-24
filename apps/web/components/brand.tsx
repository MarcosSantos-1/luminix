import Image from 'next/image'

export function Brand() {
  return (
    <div className="brand">
      <Image src="/brand/logo-letter.png" width={887} height={199} alt="Luminix" priority />
    </div>
  )
}

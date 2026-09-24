import Image from 'next/image'

export function Brand({ variant = 'default' }: { variant?: 'default' | 'white' }) {
  return (
    <div className="brand">
      <Image
        src={variant === 'white' ? '/brand/logo-letter.png' : '/brand/logo-letter-default.png'}
        width={2170}
        height={725}
        alt="Luminix"
        priority
      />
    </div>
  )
}

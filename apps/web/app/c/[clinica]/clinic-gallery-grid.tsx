import Image from 'next/image'

export function ClinicGalleryGrid({ photos, name }: { photos: string[]; name: string }) {
  return (
    <div className="clinic-gallery-grid">
      {photos.map((url, index) => (
        <a href={url} key={url} target="_blank" rel="noopener noreferrer">
          <Image
            src={url}
            alt={`Foto ${index + 1} da galeria de ${name}`}
            width={512}
            height={512}
            unoptimized
          />
        </a>
      ))}
    </div>
  )
}

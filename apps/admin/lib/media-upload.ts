type ImageKind = 'clinic_logo' | 'professional_photo'

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

async function canvasBlob(bitmap: ImageBitmap, size: number, kind: ImageKind): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.')
  const scale =
    kind === 'clinic_logo'
      ? Math.min(size / bitmap.width, size / bitmap.height)
      : Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.84),
  )
  if (!blob) throw new Error('Seu navegador não conseguiu converter a imagem.')
  return blob
}

async function prepareVariants(file: File, kind: ImageKind) {
  if (!allowedTypes.has(file.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.')
  if (file.size > 8_000_000) throw new Error('A imagem deve ter no máximo 8 MB.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 12_000 || bitmap.height > 12_000)
      throw new Error('A imagem possui dimensões inválidas ou muito grandes.')
    return {
      small: await canvasBlob(bitmap, 128, kind),
      large: await canvasBlob(bitmap, 512, kind),
    }
  } finally {
    bitmap.close()
  }
}

export async function uploadClinicMedia(options: {
  clinicId: string
  token: string
  kind: ImageKind
  subjectRef?: string
  file: File
}) {
  const variants = await prepareVariants(options.file, options.kind)
  const headers = { authorization: `Bearer ${options.token}` }
  const created = await fetch(`/api/clinics/${options.clinicId}/media`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: options.kind, subjectRef: options.subjectRef }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!created.ok) throw new Error('Não foi possível iniciar o envio da imagem.')
  const createdBody: { asset: { id: string } } = await created.json()
  for (const variant of ['small', 'large'] as const) {
    const response = await fetch(
      `/api/clinics/${options.clinicId}/media/${createdBody.asset.id}/${variant}`,
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'image/webp' },
        body: variants[variant],
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) throw new Error('Não foi possível enviar a imagem.')
  }
  const finalized = await fetch(
    `/api/clinics/${options.clinicId}/media/${createdBody.asset.id}/finalize`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!finalized.ok) throw new Error('A imagem foi enviada, mas não pôde ser finalizada.')
  return (await finalized.json()) as {
    asset: { id: string; status: 'ready'; smallUrl: string; largeUrl: string }
  }
}

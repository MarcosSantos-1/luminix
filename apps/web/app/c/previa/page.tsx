import type { Metadata } from 'next'
import '../[clinica]/clinic.css'
import { ClinicEditorPreview } from './editor-preview'

export const metadata: Metadata = {
  title: 'Prévia do site',
  robots: { index: false, follow: false },
}

/** Rendered inside the admin editor. Content arrives only by postMessage from allowed origins. */
export default function ClinicPreviewPage() {
  return <ClinicEditorPreview />
}

import type { Metadata } from 'next'
import { SiteEditorPage } from './site-editor-page'

export const metadata: Metadata = { title: 'Editar site público · Luminix' }

export default function ClinicSiteEditorPage() {
  return <SiteEditorPage />
}

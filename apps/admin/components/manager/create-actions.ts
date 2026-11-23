import {
  CalendarPlus,
  ImagePlus,
  PackagePlus,
  Flower2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { ManagerSectionId } from './demo-data'

type CreateAction = {
  id: string
  label: string
  detail: string
  icon: LucideIcon
  section: ManagerSectionId
  /** Opens the page's own creation form. */
  create?: boolean
  /** Picks photos right here and hands them to Mídia. */
  upload?: boolean
}

export const createActions: CreateAction[] = [
  {
    id: 'agendamento',
    label: 'Agendamento',
    detail: 'Marcar horário',
    icon: CalendarPlus,
    section: 'agenda',
    create: true,
  },
  {
    id: 'cliente',
    label: 'Cliente',
    detail: 'Novo cadastro',
    icon: UserPlus,
    section: 'clientes',
    create: true,
  },
  {
    id: 'midia',
    label: 'Fotos',
    detail: 'Enviar à Mídia',
    icon: ImagePlus,
    section: 'midia',
    upload: true,
  },
  {
    id: 'estoque',
    label: 'Estoque',
    detail: 'Repor ou conferir',
    icon: PackagePlus,
    section: 'estoque',
  },
  {
    id: 'promocao',
    label: 'Promoção',
    detail: 'Campanha ou arte',
    icon: Flower2,
    section: 'marketing',
  },
]

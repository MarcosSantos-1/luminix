import type { Service } from './model'

// Suggestions only: the manager explicitly decides which equipment is rented.
const equipmentCatalog = [
  {
    name: 'Laser para depilação',
    image: 1,
    description: 'Áreas de depilação a laser · Galaxy Fiber, Soprano Ice e similares.',
    services: ['Depilação a laser:'],
  },
  {
    name: 'Aparelho de criolipólise',
    image: 2,
    description: 'Sessões de criolipólise organizadas por área.',
    services: ['Criolipólise por área'],
  },
  {
    name: 'Aparelho de radiofrequência',
    image: 3,
    description: 'Um aparelho para seus atendimentos faciais e corporais.',
    services: ['Radiofrequência facial', 'Radiofrequência corporal'],
  },
  {
    name: 'Aparelho de criofrequência',
    image: 4,
    description: 'Reserve as datas de criofrequência facial e corporal.',
    services: ['Criofrequência corporal', 'Criofrequência facial'],
  },
  {
    name: 'Ultrassom estético',
    image: 5,
    description: 'Ultrassom corporal · Heccus, Manthus e similares.',
    services: ['Ultrassom estético'],
  },
  {
    name: 'Eletroestimulador',
    image: 6,
    description: 'Sessões com corrente russa ou Aussie.',
    services: ['Corrente russa corporal', 'Corrente Aussie corporal'],
  },
  {
    name: 'Manta térmica',
    image: 7,
    description: 'Organize os atendimentos que utilizam a manta.',
    services: ['Manta térmica'],
  },
  {
    name: 'Aparelho para peeling de diamante',
    image: 8,
    description: 'Microdermoabrasão com ponteira diamantada.',
    services: ['Peeling de diamante'],
  },
  {
    name: 'Aparelho para peeling ultrassônico',
    image: 9,
    description: 'Atendimentos com espátula ultrassônica.',
    services: ['Peeling ultrassônico'],
  },
  {
    name: 'Aparelho de pressoterapia',
    image: 10,
    description: 'Sessões com botas de compressão pneumática.',
    services: ['Pressoterapia'],
  },
  {
    name: 'Ultrassom microfocado portátil',
    image: 11,
    description: 'HIFU portátil: vincule apenas as áreas atendidas pelo seu modelo.',
    services: ['Ultrassom microfocado:', 'Ultrassom microfocado corporal por área'],
  },
  {
    name: 'Ultrassom microfocado',
    image: 12,
    description: 'Seu Ultraformer Day · Ultraformer, Liftera e similares.',
    services: ['Ultrassom microfocado:', 'Ultrassom microfocado corporal por área'],
  },
  {
    name: 'Laser de CO2 fracionado',
    image: 13,
    description: 'Sessões faciais, cicatrizes e estrias por área.',
    services: ['Laser de CO2 fracionado:'],
  },
  {
    name: 'Laser para remoção de pigmentos',
    image: 14,
    description: 'Remoção de tatuagem e micropigmentação · ND:YAG.',
    services: [
      'Remoção de tatuagem a laser por sessão',
      'Remoção de micropigmentação a laser por sessão',
    ],
  },
  {
    name: 'Vaporizador de ozônio',
    image: 15,
    description: 'Vapor como complemento dos cuidados faciais e capilares.',
    services: [
      'Limpeza de pele com vapor de ozônio',
      'Hidratação capilar com vapor de ozônio',
      'Spa capilar com vapor de ozônio',
    ],
  },
  {
    name: 'Aparelho de carboxiterapia',
    image: 16,
    description: 'Carboxi facial e corporal organizada por sessão.',
    services: ['Carboxiterapia:'],
  },
  {
    name: 'Aparelho de jato de plasma',
    image: 17,
    description: 'Sessões localizadas, conforme avaliação profissional.',
    services: ['Jato de plasma:'],
  },
  {
    name: 'Aparelho de endermoterapia',
    image: 18,
    description: 'Endermologia e vacuoterapia corporal.',
    services: ['Endermoterapia'],
  },
  {
    name: 'Pump Up',
    image: 19,
    description: 'Vacuoterapia com ventosas específicas para glúteos.',
    services: ['Pump Up: vacuoterapia de glúteos'],
  },
  {
    name: 'Caneta de microagulhamento',
    image: 20,
    description: 'Dermapen e similares para sessões faciais, corporais e capilares.',
    services: [
      'Microagulhamento facial',
      'Microagulhamento corporal por área',
      'Microagulhamento capilar',
    ],
  },
  {
    name: 'Equipamento de fototerapia LED',
    image: 21,
    description: 'Sessões de fototerapia facial com LED.',
    services: ['Fototerapia facial com LED'],
  },
]

export function equipmentPresentation(name: string) {
  const equipment = equipmentCatalog.find((item) => equipmentKey(item.name) === equipmentKey(name))
  return {
    image: `/brand/machines/${equipment?.image ?? 21}.webp`,
    description:
      equipment?.description ?? 'Seu aparelho personalizado, com os serviços que dependem dele.',
  }
}

export type EquipmentChoice = { name: string; serviceIds: string[] }

export function equipmentKey(name: string) {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

export function suggestedEquipment(services: Service[]): EquipmentChoice[] {
  return equipmentCatalog.flatMap((equipment) => {
    const matching = services.filter((service) =>
      equipment.services.some((name) =>
        name.endsWith(':')
          ? equipmentKey(service.name).startsWith(equipmentKey(name))
          : equipmentKey(service.name) === equipmentKey(name),
      ),
    )
    return matching.length
      ? [{ name: equipment.name, serviceIds: matching.map((service) => service.id) }]
      : []
  })
}

export function configuredEquipment(services: Service[]): EquipmentChoice[] {
  const groups = new Map<string, EquipmentChoice>()
  for (const service of services) {
    if (service.bookingMode !== 'manual_release' || !service.resourceName.trim()) continue
    const key = equipmentKey(service.resourceName)
    const group = groups.get(key) ?? { name: service.resourceName.trim(), serviceIds: [] }
    group.serviceIds.push(service.id)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function applyEquipment(services: Service[], equipment: EquipmentChoice[]): Service[] {
  return services.map((service) => {
    const selected = equipment.find((item) => item.serviceIds.includes(service.id))
    if (selected)
      return { ...service, bookingMode: 'manual_release', resourceName: selected.name.trim() }
    if (service.bookingMode === 'manual_release' && service.resourceName.trim()) {
      return { ...service, bookingMode: 'instant', resourceName: '' }
    }
    return service
  })
}

import type { Service } from './model'

// Suggestions only: the manager explicitly decides which equipment is rented.
const equipmentCatalog = [
  { name: 'Laser para depilação', services: ['Depilação a laser:'] },
  { name: 'Aparelho de criolipólise', services: ['Criolipólise por área'] },
  {
    name: 'Aparelho de radiofrequência',
    services: ['Radiofrequência facial', 'Radiofrequência corporal'],
  },
  { name: 'Aparelho de criofrequência', services: ['Criofrequência corporal'] },
  { name: 'Ultrassom estético', services: ['Ultrassom estético'] },
  { name: 'Aparelho de endermoterapia', services: ['Endermoterapia'] },
  { name: 'Eletroestimulador', services: ['Corrente russa corporal'] },
  { name: 'Aparelho de pressoterapia', services: ['Pressoterapia'] },
  { name: 'Manta térmica', services: ['Manta térmica'] },
  { name: 'Aparelho para peeling de diamante', services: ['Peeling de diamante'] },
  { name: 'Aparelho para peeling ultrassônico', services: ['Peeling ultrassônico'] },
  { name: 'Equipamento de fototerapia LED', services: ['Fototerapia facial com LED'] },
]

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

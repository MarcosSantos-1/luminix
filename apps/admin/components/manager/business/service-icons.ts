import {
  Eye,
  Feather,
  Flower2,
  Gem,
  Hand,
  HandHeart,
  Heart,
  PenTool,
  PersonStanding,
  Scissors,
  Sparkles,
  Syringe,
  type LucideIcon,
} from 'lucide-react'

/** Icon for a service, from its category (or its name when the category is custom). */
const rules: [RegExp, LucideIcon][] = [
  [/cabel|corte|escova|colora|mecha|penteado|barb/, Scissors],
  [/unha|manicure|pedicure|esmalt|gel/, Hand],
  [/sobrancel|cilio|lash|brow|henna/, Eye],
  [/depila|cera|laser/, Feather],
  [/tatua|tattoo/, PenTool],
  [/piercing|furo/, Gem],
  [/massag|massot|drenag|relax/, HandHeart],
  [/quiropr|postur|coluna/, PersonStanding],
  [/biomed|botox|preench|injet|harmoniz/, Syringe],
  [/corporal|corpo|spa/, Flower2],
  [/facial|pele|limpeza|estetic/, Sparkles],
]

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function serviceIcon(category: string, name = ''): LucideIcon {
  for (const text of [fold(category), fold(name)])
    for (const [pattern, icon] of rules) if (pattern.test(text)) return icon
  return Heart
}

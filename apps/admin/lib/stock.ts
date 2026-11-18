/**
 * "Estoque inteligente": how products are counted, the suggestions catalog and the recipes of
 * the onboarding services. The catalogs are estimates the space adjusts; nothing here creates
 * stock by itself (a product only exists after the space registers it).
 */
import productsFile from './stock-products.json'
import recipesFile from './stock-recipes.json'

export type StockUnit = 'un' | 'ml' | 'l' | 'g' | 'kg' | 'cx' | 'fr' | 'par' | 'm' | 'cm' | 'folha'

export type CatalogProduct = {
  id: string
  nome: string
  categorias: string[]
  unidade: StockUnit
  /** Usual package content, in `unidade`. */
  embalagem?: number
  aviso_percentual: number
  lote_validade?: boolean
}

type Recipe = { categoria: string; nome: string; insumos: [string, number][] }

export const stockProducts = (productsFile as { produtos: CatalogProduct[] }).produtos
const recipes = (recipesFile as unknown as { servicos: Recipe[] }).servicos

export const unitOptions: { id: StockUnit; label: string; short: string; one: string }[] = [
  { id: 'un', label: 'Unidades', short: 'un', one: 'unidade' },
  { id: 'ml', label: 'Mililitros (ml)', short: 'ml', one: 'ml' },
  { id: 'g', label: 'Gramas (g)', short: 'g', one: 'g' },
  { id: 'm', label: 'Metros', short: 'm', one: 'metro' },
  { id: 'cm', label: 'Centímetros', short: 'cm', one: 'cm' },
  { id: 'folha', label: 'Folhas', short: 'folhas', one: 'folha' },
  { id: 'l', label: 'Litros', short: 'L', one: 'litro' },
  { id: 'kg', label: 'Quilos', short: 'kg', one: 'kg' },
  { id: 'fr', label: 'Frascos', short: 'frascos', one: 'frasco' },
  { id: 'cx', label: 'Caixas', short: 'caixas', one: 'caixa' },
  { id: 'par', label: 'Pares', short: 'pares', one: 'par' },
]
export const packageLabels = [
  'frasco',
  'pote',
  'caixa',
  'pacote',
  'bisnaga',
  'rolo',
  'galão',
  'refil',
  'kit',
] as const

const plural: Record<string, string> = { par: 'pares', galão: 'galões' }
export const pluralize = (word: string, count: number) =>
  count === 1 ? word : (plural[word] ?? `${word}s`)

export function unitShort(unit: string) {
  return unitOptions.find((option) => option.id === unit)?.short ?? unit
}

/** Typical package for a unit when the catalog does not say. */
export function defaultPackageLabel(unit: string) {
  return unit === 'ml'
    ? 'frasco'
    : unit === 'g'
      ? 'pote'
      : unit === 'm' || unit === 'cm'
        ? 'rolo'
        : unit === 'folha'
          ? 'pacote'
          : 'caixa'
}

export const amount = (value: number, digits = 2) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: digits })

/** "2,5 potes" when the product comes in packages, "500 ml" otherwise. */
export function describeStock(item: {
  quantity: number
  unit: string
  packageSize?: number | null
  packageLabel?: string | null
}) {
  const base = `${amount(item.quantity)} ${unitShort(item.unit)}`
  if (!item.packageSize)
    return { main: amount(item.quantity), label: unitShort(item.unit), base: '' }
  const packages = item.quantity / item.packageSize
  const label = item.packageLabel || defaultPackageLabel(item.unit)
  return { main: amount(packages, 1), label: pluralize(label, packages), base }
}

export const fold = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Suggestions for a space, grouped by its service categories; general items at the end. */
export function suggestionsFor(
  serviceCategories: string[],
  taken: { names: Set<string>; ids: Set<string> },
) {
  const categories = [...new Set(serviceCategories)]
  const wanted = new Set(categories.map(fold))
  const fresh = (product: CatalogProduct) =>
    !taken.ids.has(product.id) && !taken.names.has(fold(product.nome))
  const groups = categories
    .map((category) => ({
      category,
      products: stockProducts.filter(
        (product) =>
          fresh(product) && product.categorias.some((name) => fold(name) === fold(category)),
      ),
    }))
    .filter((group) => group.products.length)
  const general = stockProducts.filter(
    (product) =>
      fresh(product) &&
      (!product.categorias.length || (!wanted.size && product.categorias.length > 0)),
  )
  if (general.length) groups.push({ category: 'Descartáveis e higiene', products: general })
  // A product shown under one category does not repeat under the next.
  const seen = new Set<string>()
  return groups
    .map((group) => ({
      ...group,
      products: group.products.filter((product) => !seen.has(product.id) && seen.add(product.id)),
    }))
    .filter((group) => group.products.length)
}

/** Recipe lines that use a catalog product, matched to the space's own services by name. */
export function recipesFor(
  productId: string,
  services: { id: string; name: string; category: string; status?: string }[],
) {
  const byKey = new Map(
    recipes.map((recipe) => [`${fold(recipe.categoria)}|${fold(recipe.nome)}`, recipe]),
  )
  return services.flatMap((service) => {
    const recipe = byKey.get(`${fold(service.category)}|${fold(service.name)}`)
    const line = recipe?.insumos.find(([id]) => id === productId)
    return line ? [{ serviceId: service.id, quantity: line[1] }] : []
  })
}

/** What the catalog suggests a service uses (by name), for the recipe editor of a service. */
export function catalogRecipe(service: { name: string; category: string }) {
  const recipe = recipes.find(
    (entry) =>
      fold(entry.categoria) === fold(service.category) && fold(entry.nome) === fold(service.name),
  )
  return (recipe?.insumos ?? []).map(([productId, quantity]) => ({
    product: stockProducts.find((product) => product.id === productId),
    quantity,
  }))
}

/** Days until it runs out at the pace of the last 30 days; null without use. */
export function daysLeft(quantity: number, used30: number) {
  if (!used30 || quantity <= 0) return null
  return Math.max(0, Math.round(quantity / (used30 / 30)))
}

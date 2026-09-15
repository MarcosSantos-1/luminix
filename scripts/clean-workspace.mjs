import { execFileSync } from 'node:child_process'
import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const root = await realpath(join(dirname(fileURLToPath(import.meta.url)), '..'))
const dryRun = process.argv.includes('--dry-run')
const generated = ['node_modules', '.next', '.expo', 'dist', 'coverage', '.turbo']

function assertInside(path) {
  const local = relative(root, path)
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`Caminho fora do projeto: ${path}`)
  }
}

async function exists(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const projects = [root]
for (const group of ['apps', 'packages']) {
  const folder = join(root, group)
  if (!(await exists(folder))) continue
  assertInside(await realpath(folder))
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const project = join(folder, entry.name)
    if (await exists(join(project, 'package.json'))) projects.push(project)
  }
}

// Refuse to delete tracked source, even if someone used a generated directory name.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const targets = []
for (const project of projects) {
  const resolvedProject = await realpath(project)
  if (project !== root) assertInside(resolvedProject)
  for (const name of generated) {
    const target = join(resolvedProject, name)
    assertInside(target)
    const stat = await exists(target)
    if (!stat) continue
    if (stat.isSymbolicLink()) throw new Error(`Link preservado por segurança: ${target}`)
    if (!stat.isDirectory()) throw new Error(`Esperava uma pasta: ${target}`)
    assertInside(await realpath(target))
    const local = relative(root, target).split(sep).join('/')
    if (tracked.some((file) => file === local || file.startsWith(`${local}/`))) {
      throw new Error(`Pasta com arquivos versionados preservada: ${local}`)
    }
    targets.push(target)
  }
}

console.log('Limpeza do workspace — .env, código, .git, ios/android e legacy preservados.')
for (const target of targets) console.log(`  ${relative(root, target)}`)
if (!targets.length) {
  console.log('Nada para remover.')
} else if (dryRun) {
  console.log('Simulação: nenhuma pasta foi removida.')
} else {
  if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo ou use --dry-run.')
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  let answer
  try {
    answer = await terminal.question('Pare os servidores antes. Digite REMOVER para confirmar: ')
  } finally {
    terminal.close()
  }
  if (answer.trim() === 'REMOVER') {
    for (const target of targets) {
      assertInside(await realpath(target))
      await rm(target, { recursive: true, force: false, maxRetries: 3, retryDelay: 300 })
      console.log(`Removido: ${relative(root, target)}`)
    }
    console.log(
      'Concluído. Para recuperar dependências: pnpm install. Builds/caches serão recriados.',
    )
  } else {
    console.log('Cancelado: nenhuma pasta foi removida.')
  }
}

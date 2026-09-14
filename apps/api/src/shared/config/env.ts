const environments = ['development', 'test', 'production'] as const

type Environment = (typeof environments)[number]

export type AppConfig = {
  host: string
  logLevel: string
  nodeEnv: Environment
  port: number
}

function readEnvironment(value: string | undefined): Environment {
  const environment = value ?? 'development'

  if (!environments.includes(environment as Environment)) {
    throw new Error(`NODE_ENV inválido: ${environment}`)
  }

  return environment as Environment
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3333)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT inválida: ${value ?? ''}`)
  }

  return port
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: environment.HOST ?? '0.0.0.0',
    logLevel: environment.LOG_LEVEL ?? 'info',
    nodeEnv: readEnvironment(environment.NODE_ENV),
    port: readPort(environment.PORT),
  }
}

import type { FastifyServerOptions } from 'fastify'

import type { AppConfig } from './env.js'

export function createLoggerOptions(config: AppConfig) {
  return {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    serializers: {
      req(request: { id: string; method: string; url: string }) {
        return { id: request.id, method: request.method, url: request.url.split('?')[0] }
      },
      res(response: { statusCode: number }) {
        return { statusCode: response.statusCode }
      },
    },
    ...(config.nodeEnv === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env),
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: true,
            },
          },
        }
      : {}),
  } satisfies FastifyServerOptions['logger']
}

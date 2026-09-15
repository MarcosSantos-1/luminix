import { describe, expect, it } from 'vitest'

import { readConfig } from '../src/shared/config/env.js'
import { createLoggerOptions } from '../src/shared/config/logger.js'

describe('logger configuration', () => {
  it('uses pretty logs only in development', () => {
    const development = createLoggerOptions(readConfig({ NODE_ENV: 'development' }))
    expect(development).toHaveProperty('transport.target', 'pino-pretty')
    for (const nodeEnv of ['production', 'test']) {
      expect(createLoggerOptions(readConfig({ NODE_ENV: nodeEnv }))).not.toHaveProperty('transport')
    }
  })

  it('omits query strings and request headers from serialized requests', () => {
    const options = createLoggerOptions(readConfig())
    if (!options || typeof options !== 'object' || !options.serializers?.req) {
      throw new Error('Request serializer missing')
    }
    const request = {
      id: 'req-1',
      method: 'GET',
      url: '/health?token=secret',
      headers: { authorization: 'Bearer secret', cookie: 'session=secret' },
    }
    expect(options.serializers.req(request)).toEqual({ id: 'req-1', method: 'GET', url: '/health' })
  })
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Each integration suite boots its own PGlite database and all migrations.
    // Keep memory bounded on developer machines and make the root check reproducible.
    maxWorkers: 1,
  },
})

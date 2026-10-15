// The worst-case simulation runs for a few minutes, so it lives outside `npm test`:
//   npm run sim        (writes sim/results.json)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['sim/**/*.sim.ts'], testTimeout: 300_000 },
})

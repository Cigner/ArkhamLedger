import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/** Unmounts anything a component test rendered so tests cannot leak DOM state. */
afterEach(() => {
  cleanup()
})

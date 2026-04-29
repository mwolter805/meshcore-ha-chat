import { defineConfig } from 'vitest/config';

// Minimal Vitest configuration for the meshcore-chat-panel frontend.
//
// We test pure-data utility modules (e.g. sensor-thresholds) only — Lit
// components are exercised manually against the home HA instance during
// implementation. Adding jsdom + @lit/labs/testing belongs in a follow-up
// if/when component-level tests become worth the carry cost.

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Vitest defaults are fine; no globals, no setup file.
  },
});

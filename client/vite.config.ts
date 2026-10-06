/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only ever talks to our own backend; the OANDA key stays server-side.
    proxy: { '/api': API_TARGET },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

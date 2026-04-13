import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "SUPABASE_"],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})

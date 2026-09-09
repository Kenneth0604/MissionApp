import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base 對應 GitHub Pages 路徑:https://kenneth0604.github.io/MissionApp/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/MissionApp/',
})

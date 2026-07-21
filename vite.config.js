import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("react") || id.includes("react-dom")) return "react";
          if (id.includes("Landing.jsx"))  return "landing";
          if (id.includes("DApp.jsx"))     return "dapp";
        },
      },
    },
  },
})

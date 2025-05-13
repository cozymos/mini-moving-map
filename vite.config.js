// vite.config.js
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({  
  // Server configuration
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    cors: true,
    allowedHosts: [
      'dd9e355b-cd05-427e-8617-ed08b12c4645-00-nmtx4zmot6kr.kirk.replit.dev',
      '.replit.dev',
      '.replit.app'
    ],
    hmr: {
      clientPort: 443
    }
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
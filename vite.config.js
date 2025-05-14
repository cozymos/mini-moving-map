// vite.config.js
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({  
  // Server configuration
  server: {
    port: 5000,
    host: '0.0.0.0',
    /*
    hmr: {
      clientPort: 443
    },
    strictPort: true,
    */
    cors: true,
    allowedHosts: [
      '.replit.dev',
      '.replit.app'
    ]
  }
})
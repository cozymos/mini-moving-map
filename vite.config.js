// vite.config.js
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current directory
  const env = loadEnv(mode, process.cwd(), '')
  
  // Common configuration for both dev and build
  const commonConfig = {
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
    
    // Define global constants replaced at build time
    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || mode),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
    }
  }
  
  // Development specific configuration
  if (command === 'serve') {
    return {
      ...commonConfig,
      // Development-only settings
      // (Any dev-specific settings would go here)
    }
  } 
  // Production build configuration
  else {
    return {
      ...commonConfig,
      // Production-only settings
      build: {
        outDir: 'dist',
        assetsInlineLimit: 4096, // 4kb - assets smaller than this will be inlined as base64
        rollupOptions: {
          output: {
            manualChunks: {
              // Split vendor code into separate chunks for better caching
              vendor: ['src/main.js']
            }
          }
        }
      }
    }
  }
})
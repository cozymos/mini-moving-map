// vite.config.js
export default {
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    hmr: {
      host: '0.0.0.0',
      port: 5000
    },
    cors: true,
    allowedHosts: 'all'
  }
}
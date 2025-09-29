import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';

const enableESLint = true;

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.replit.dev', '.replit.app'],
    port: 5001,
    proxy: {
      // Proxy requests starting with '/api' backend URL
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  plugins: [
    enableESLint &&
      eslint({
        fix: false,
        cache: false,
        include: ['src/**/*.js'],
        exclude: ['node_modules/**'],
      }),
  ],
});

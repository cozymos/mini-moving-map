import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';

const enableESLint = false;

export default defineConfig({
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
    allowedHosts: ['.replit.dev', '.replit.app'],
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

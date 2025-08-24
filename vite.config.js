import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';

const enableESLint = true;

export default defineConfig({
  server: {
    host: '0.0.0.0',
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

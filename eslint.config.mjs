import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    // Ignore build artifacts and dependencies
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2021, // Flat config requires number, not "latest"
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      }
    },
    plugins: { js },
    extends: ["js/recommended"],
    rules: {
      "no-unused-vars": "warn"
    }
  }
]);

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "web/.next/**",
      "web/public/**",
      "web/node_modules/**",
      "web/next-env.d.ts",
      "node_modules/**",
      "_legacy/**",
      "assets/js/ican.js",
      "assets/bootstrap/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["assets/js/lms/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Plain-JS browser scripts. ican.js is frozen and ignored above.
    files: ["assets/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.browser,
    },
  },
  {
    files: ["vite.config.ts", "scripts/**/*.mjs", "SECURITY_AUDIT_PROBES.mjs", "web/**/*.ts", "web/**/*.tsx", "web/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-console": "off",
    },
  },
);

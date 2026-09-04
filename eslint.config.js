import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "public/data", "node_modules"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // The 1.18 MB corpus must never re-enter the bundle: scripts/build-data.mjs is
      // the only permitted consumer of the canonical file.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/data/verses.json"],
              message: "Do not import verses.json — it is the build-time source for scripts/build-data.mjs. Use src/lib/gita.ts instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-imports": "off" },
  },
);

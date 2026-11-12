import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ESLint 9 flat configuration for Next.js 16 (replaces removed `next lint`).
 * Scope: All TypeScript, React, and Next.js App Router source files.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "Guide-Files/**",
    ".agents/**",
    ".aider-desk/**",
    ".augment/**",
    ".autohand/**",
    ".bob/**",
    ".claude/**",
    ".codeartsdoer/**",
    ".codebuddy/**",
    ".codemaker/**",
    ".codestudio/**",
    ".commandcode/**",
    ".continue/**",
    ".cortex/**",
    ".crush/**",
    ".cursor/**",
    ".devin/**",
    ".mux/**",
    ".qwen/**",
    ".zcode/**",
    ".zencoder/**",
    "data/**",
    "skills/**",
  ]),
]);

export default eslintConfig;

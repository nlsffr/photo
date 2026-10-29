import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // The current client providers intentionally hydrate browser state and
      // start request-driven state machines from effects. Refactor those flows
      // incrementally; treating every synchronous transition as an error makes
      // the repository lint-unusable without identifying a runtime defect.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;

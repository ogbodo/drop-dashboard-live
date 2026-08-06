// Jest configuration for the Next.js 16 / React 19 dashboard.
//
// NOTE: This is authored as CommonJS (jest.config.js) rather than jest.config.ts
// on purpose: a .ts jest config requires `ts-node` at load time, which is not a
// dependency of this project. next/jest still transpiles the TEST files (and all
// app source) with SWC + the project's tsconfig, so tests are full TypeScript.
//
// GOTCHA: if every suite suddenly fails with "Cannot use import statement
// outside a module" on jest.setup.ts, jest's transform cache (in the OS tmpdir,
// NOT node_modules) was poisoned with untransformed output — usually after a
// window where the platform SWC binary (@next/swc-*) was missing. A clean
// `npm install` does NOT fix it because the cache lives outside node_modules.
// Run `npx jest --clearCache` to bust it.
const createJestConfig = require("next/jest").default({
  // Path to the Next.js app so next/jest can load next.config and .env files.
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Mirror the "@/*" -> "./*" path alias declared in tsconfig.json.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  // The supabase/ dir holds Deno edge functions (npm: specifiers, explicit .ts
  // imports) that jest can't transform; keep them out of jest's module scan
  // (tsconfig already excludes supabase from tsc for the same reason).
  modulePathIgnorePatterns: ["<rootDir>/supabase/"],
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx,js}",
    "proxy.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

// Exported as an async factory so next/jest can load the (async) Next.js config.
module.exports = createJestConfig(customJestConfig);

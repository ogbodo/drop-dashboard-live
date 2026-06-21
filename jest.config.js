// Jest configuration for the Next.js 16 / React 19 dashboard.
//
// NOTE: This is authored as CommonJS (jest.config.js) rather than jest.config.ts
// on purpose: a .ts jest config requires `ts-node` at load time, which is not a
// dependency of this project. next/jest still transpiles the TEST files (and all
// app source) with SWC + the project's tsconfig, so tests are full TypeScript.
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
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx,js}",
    "proxy.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
};

// Exported as an async factory so next/jest can load the (async) Next.js config.
module.exports = createJestConfig(customJestConfig);

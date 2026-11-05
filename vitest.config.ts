import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)", "convex/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
      exclude: [
        "convex/_generated/**",
        "src/routeTree.gen.ts",
        "src/components/ui/**",
        "**/*.test.ts",
      ],
      thresholds: { lines: 20, functions: 20, branches: 20, statements: 20 },
    },
  },
});

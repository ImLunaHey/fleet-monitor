import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/types.ts",
        "src/test-setup.ts",
        "src/**/*.test.{ts,tsx}",
        "src/test-fixtures.ts",
      ],
      thresholds: { perFile: true, statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});

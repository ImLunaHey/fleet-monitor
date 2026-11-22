import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.js"] },
});

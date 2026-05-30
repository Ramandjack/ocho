import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // En Express la SPA vive en /app/; en Netlify en la raíz /.
  // VITE_BASE_URL=/ al buildear para Netlify.
  base: process.env.VITE_BASE_URL || "/app/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
}));

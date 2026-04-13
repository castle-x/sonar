import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // gve dev 会通过进程环境注入 VITE_BACKEND_TARGET，优先使用
  const backendTarget = process.env.VITE_BACKEND_TARGET || env.VITE_BACKEND_TARGET || "http://localhost:9090";

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@/app": path.resolve(__dirname, "./src/app"),
        "@/views": path.resolve(__dirname, "./src/views"),
        "@/shared": path.resolve(__dirname, "./src/shared"),
      },
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-query": ["@tanstack/react-query"],
            "vendor-router": ["react-router"],
            "vendor-charts": ["recharts"],
          },
        },
      },
    },

    server: {
      host: "localhost",
      port: 5175,
      strictPort: true,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
        "/_": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

import { defineConfig } from "vite"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react-swc"

export default defineConfig({
	base: "/",  // 🔥 修改：生产环境使用绝对路径
	plugins: [
		react(),
		tailwindcss(),
	],
	esbuild: {
		legalComments: "external",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		host: "0.0.0.0",
		port: 5175,
		proxy: {
			// 代理 API 请求到后端服务
			"/apis": {
				target: "http://localhost:8081",
				changeOrigin: true,
			},
			// 代理图标请求到后端服务
			"/icons": {
				target: "http://localhost:8081",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		assetsDir: "assets",
		rollupOptions: {
			output: {
				manualChunks: {
					"react-vendor": ["react", "react-dom"],
				},
			},
		},
	},
})


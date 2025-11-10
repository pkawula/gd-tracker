import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler"]],
			},
		}),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["ios/180.png"],
			manifest: {
				name: "GD Tracker - Gestational Diabetes Monitor",
				short_name: "GD Tracker",
				description: "Track your gestational diabetes glucose readings",
				theme_color: "#4f46e5",
				background_color: "#ffffff",
				display: "standalone",
				orientation: "portrait",
				icons: [
					{
						src: "android/android-launchericon-144-144.png",
						sizes: "144x144",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "android/android-launchericon-192-192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "android/android-launchericon-512-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "android/android-launchericon-512-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
						handler: "NetworkFirst",
						options: {
							cacheName: "supabase-cache",
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});

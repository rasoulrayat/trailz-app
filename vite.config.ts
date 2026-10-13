import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // No remote bindings locally: dev runs on sample results (MOCK_AI=1) and needs no Cloudflare login.
  plugins: [react(), cloudflare({ remoteBindings: false })],
  // The map library (~270 kB gzipped) is its own chunk, loaded only on screens with a map.
  build: { chunkSizeWarningLimit: 1100 },
});

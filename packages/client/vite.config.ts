import { defineConfig } from "vite";
import path from 'path'; // Import path module

// https://vitejs.dev/config/
export default ({ mode }) => {

  const isLocalhost = process.env.NODE_ENV === 'development';

  return defineConfig({
    envDir: "../../",
    // Add resolve alias
    resolve: {
      alias: {
        '@server': path.resolve(__dirname, '../server/src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
          },
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        "/.proxy/assets": {
          target: "http://localhost:3000/assets",
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/.proxy\/assets/, ""),
        },
        "/.proxy/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/.proxy\/api/, ""),
        }
      },
      hmr: {
        clientPort: isLocalhost ? 3000 : 443, 
      },
    },
  });
};

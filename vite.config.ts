
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['framer-motion', 'react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    hmr: {
      clientPort: 443, // Run on 443 because the environment is behind HTTPS proxy
    },
    proxy: {
      '/api': {
        target: 'https://ais-pre-wcezktn6y3u7ylhpagfte7-108186802350.us-east1.run.app',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});

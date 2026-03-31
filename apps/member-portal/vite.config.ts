import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Portail membre : 5174 pour ne pas entrer en conflit avec l’admin (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});

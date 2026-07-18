import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // `.tsx` inclus : les tests de rendu de composants portent l'extension JSX.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});

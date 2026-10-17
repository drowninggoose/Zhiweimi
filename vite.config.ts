import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { aiGateway } from './server/aiGateway';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AI_');
  const gateway = aiGateway({
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL,
  });
  return {
    plugins: [
      react(),
      {
        name: 'zhiweimi-ai-gateway',
        configureServer(server) {
          server.middlewares.use(gateway);
        },
        configurePreviewServer(server) {
          server.middlewares.use(gateway);
        },
      },
    ],
    resolve: { preserveSymlinks: true },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      include: ['src/test/**/*.test.{ts,tsx}'],
      fsModuleCache: true,
      fsModuleCachePath: './node_modules/.vitest-cache',
    },
  };
});

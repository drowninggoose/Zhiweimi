import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { aiGateway } from './server/aiGateway';
import { voiceGateway } from './server/voiceGateway';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AI_');
  // 语音助手用独立前缀 VOICE_，与队友的 AI_ 完全隔离，互不影响
  const voiceEnv = loadEnv(mode, process.cwd(), 'VOICE_');
  const gateway = aiGateway({
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL,
  });
  const voice = voiceGateway({
    apiKey: voiceEnv.VOICE_API_KEY,
    model: voiceEnv.VOICE_MODEL,
    baseUrl: voiceEnv.VOICE_BASE_URL,
    dashscopeBase: voiceEnv.VOICE_DASHSCOPE_BASE,
    asrModel: voiceEnv.VOICE_ASR_MODEL,
  });
  return {
    plugins: [
      react(),
      {
        name: 'zhiweimi-ai-gateway',
        configureServer(server) {
          server.middlewares.use(gateway);
          server.middlewares.use(voice);
        },
        configurePreviewServer(server) {
          server.middlewares.use(gateway);
          server.middlewares.use(voice);
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

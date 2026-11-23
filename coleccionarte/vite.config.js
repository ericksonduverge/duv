import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // `npm run dev` forwards api/*.php to a local PHP server: php -S 127.0.0.1:8080 -t public
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});

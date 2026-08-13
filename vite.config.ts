import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Vite inlines import.meta.env.* as literals at build time. If these are
  // missing the guard in src/lib/supabase.ts folds to a constant `true`, and
  // the bundler dead-code-eliminates supabase-js and every chart behind it —
  // producing a *successful* build of an app that throws on load. Fail here
  // instead, so a misconfigured CI deploy is caught before it ships.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
      (key) => !env[key],
    )
    if (missing.length > 0) {
      throw new Error(
        `Missing required build env: ${missing.join(', ')}.\n` +
          'Locally: copy .env.example to .env.local and fill it in.\n' +
          'On Cloudflare Pages: set them under Settings -> Variables and Secrets.',
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    // The About row shows a version, and package.json is the only place it is
    // written down. Inlined rather than imported so the JSON does not end up in
    // the bundle for the sake of one string.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  }
})

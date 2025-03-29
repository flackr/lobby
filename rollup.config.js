import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default [{
    input: './src/server/index.ts',
    external: ['dotenv/config', 'finalhandler', 'formidable', 'pg', 'node:fs', 'node:http', 'node:process', 'nodemailer', 'serve-static', 'ws'],
    output: {
      file: './dist/server.min.js',
      format: 'es',
    },
    plugins: [typescript()]
  }, {
    input: './src/library/index.ts',
    output: {
      file: './dist/lobby.min.js',
      format: 'iife',
      name: 'lobby',
      sourcemap: true,
    },
    plugins: [typescript(), terser()]
  }];

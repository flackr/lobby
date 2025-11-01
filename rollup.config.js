import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';

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
  },
  {
    input: './src/index.ts',
    output: {
      file: './dist/bundle.min.js',
      format: 'iife',
      name: 'bundle',
      sourcemap: true,
    },
    plugins: [typescript(), terser(), copy({
      targets: [
        { src: 'src/index.html', dest: 'dist' },
        { src: 'src/css/style.css', dest: 'dist/css' }
      ]
    })]
  }];

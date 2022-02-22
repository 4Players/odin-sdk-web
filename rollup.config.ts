import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'lib/index.js',
  output: [
    {
      file: 'dist/odin.js',
      format: 'iife',
      name: 'ODIN',
      sourcemap: 'inline',
      sourcemapExcludeSources: true,
    },
  ],
  plugins: [resolve(), commonjs()],
};

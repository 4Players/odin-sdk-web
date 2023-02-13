import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'lib/esm/index.js',
  output: [
    {
      file: 'dist/odin.js',
      format: 'iife',
      name: 'ODIN',
      sourcemap: 'inline',
      sourcemapExcludeSources: true,
    },
  ],
  plugins: [commonjs(), resolve()],
};

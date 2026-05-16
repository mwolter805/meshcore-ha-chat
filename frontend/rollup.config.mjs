import fs from 'fs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const dev = process.env.ROLLUP_WATCH === 'true';
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default {
  input: 'src/meshcore-chat-panel.ts',
  output: {
    // Bundle ships flat at the integration root — see panel.py for the
    // matching StaticPathConfig that serves this file.
    file: '../custom_components/meshcore_chat/meshcore-chat-panel.js',
    format: 'es',
    // Banner stamps the package.json version into the bundle so a
    // deployed copy is self-identifying. Uses the /*! ... */ convention
    // for "important" comments; terser is configured below to preserve
    // them. Lets `grep <version> meshcore-chat-panel.js` confirm what
    // version is on the HA host.
    banner: `/*! meshcore-chat-panel v${pkg.version} */`,
    sourcemap: dev,
  },
  plugins: [
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      sourceMap: dev,
      include: ['src/**/*.ts'],
    }),
    !dev &&
      terser({
        compress: {
          drop_console: false,
          passes: 2,
        },
        format: {
          // Preserve /*! ... */ banner comments (the version stamp);
          // everything else is still stripped.
          comments: /^!/,
        },
      }),
  ].filter(Boolean),
};

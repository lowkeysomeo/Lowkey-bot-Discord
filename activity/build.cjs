const { buildSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
buildSync({ entryPoints: [path.join(__dirname, 'src/main.js')], bundle: true, format: 'esm', minify: true, target: 'es2022', outfile: path.join(__dirname, 'dist/main.js') });
for (const file of ['index.html', 'style.css']) fs.copyFileSync(path.join(__dirname, 'src', file), path.join(__dirname, 'dist', file));
console.log('Built VNL Cinema Activity.');

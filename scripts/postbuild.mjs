import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const docsDir = resolve('docs');
const noJekyllPath = resolve(docsDir, '.nojekyll');
const htaccessPath = resolve(docsDir, '.htaccess');

const htaccessContent = `
# Ensure JavaScript modules are served with the correct MIME type.
AddType application/javascript .js
AddType application/javascript .mjs
AddType application/javascript .ts
AddType application/javascript .tsx
AddType text/css .css
AddType text/html .html
`;

await mkdir(docsDir, { recursive: true });
await writeFile(noJekyllPath, '', { encoding: 'utf8' });
await writeFile(htaccessPath, `${htaccessContent.trim()}` + '\n', {
  encoding: 'utf8',
});

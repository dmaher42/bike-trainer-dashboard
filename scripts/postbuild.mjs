import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const docsDir = resolve('docs');
const noJekyllPath = resolve(docsDir, '.nojekyll');

await mkdir(docsDir, { recursive: true });
await writeFile(noJekyllPath, '', { encoding: 'utf8' });

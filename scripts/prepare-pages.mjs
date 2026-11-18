import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('server', { recursive: true });
const storefront=readFileSync('site/storefront.html','utf8');
const admin=readFileSync('site/admin.html','utf8');
writeFileSync('server/pages.generated.js',`export const storefront=${JSON.stringify(storefront)};\nexport const admin=${JSON.stringify(admin)};\n`);

const target=process.argv[2]==='vercel'?'vercel':'sites';
writeFileSync('server/runtime-selected.ts',`export {getRuntime} from './runtime-${target}';\n`);

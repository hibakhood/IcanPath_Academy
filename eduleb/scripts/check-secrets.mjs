// Scoped current-file check. Never prints matched values. No claim about Git history.
import { readdirSync,readFileSync,statSync } from 'node:fs';
import { resolve,relative } from 'node:path';
const root=resolve(import.meta.dirname,'..');const skip=new Set(['node_modules','.git','.next','dist','public','.agents','.codex']);let checked=0;const flagged=[];
function visit(dir){for(const name of readdirSync(dir)){if(skip.has(name))continue;const path=resolve(dir,name);if(statSync(path).isDirectory()){visit(path);continue;}
 if(!/\.(ts|tsx|js|mjs|sql|json|php|html|ya?ml)$/.test(name)&&!name.startsWith('.env'))continue;
 const source=readFileSync(path,'utf8');checked++;
 const privateKey=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source);
 const providerSecret=/\b(?:sb_secret_|sk_live_|github_pat_|ghp_)[A-Za-z0-9_-]{20,}/.test(source);
 const exposedService=[...source.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)].some(m=>{try{return JSON.parse(Buffer.from(m[1],'base64url').toString()).role==='service_role';}catch{return false;}});
 if(privateKey||providerSecret||exposedService)flagged.push(relative(root,path));
}}
visit(root);if(flagged.length){console.error('Potential secret found in files:',flagged.join(', '));process.exitCode=1;}else console.log('Scoped secret pattern check:',checked,'files checked; no matches. Deployment secrets and history not verified.');

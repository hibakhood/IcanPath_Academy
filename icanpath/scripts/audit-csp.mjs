import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const files=readdirSync(root).filter(f=>f.endsWith('.html'));
const pages=files.map(file=>{
 const html=readFileSync(resolve(root,file),'utf8');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')&&!m[1].includes('application/ld+json'));
 const attrs=[...html.matchAll(/\sstyle=("[^"]*"|'[^']*')/gi)];
 return {file,inlineScripts:scripts.length,scriptHashes:scripts.map(m=>"'sha256-"+createHash('sha256').update(m[2]).digest('base64')+"'"),styleAttributes:attrs.length,inlineStyleBlocks:[...html.matchAll(/<style\b/gi)].length};
});
const report={pages,remainingRuntimeSources:['Existing style attributes and auth popup style blocks: explicitly permitted by style-src unsafe-inline','Next React bootstrap: per-request nonces supplied by Proxy for /courses routes'],status:'Script CSP enforced by default; report-only requires explicit override. Inline CSS remains an intentional compatibility exception.'};
writeFileSync(resolve(root,'CSP_COMPATIBILITY_INVENTORY.json'),JSON.stringify(report,null,2)+'\n');
console.log('CSP inventory:',pages.length,'marketing pages;',pages.reduce((n,p)=>n+p.inlineScripts,0),'executable inline scripts;',pages.reduce((n,p)=>n+p.styleAttributes,0),'style attributes. Script CSP is enforced by default with an explicit inline CSS compatibility exception.');

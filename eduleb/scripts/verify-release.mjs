import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const cwd=resolve(import.meta.dirname,'..');
const checks=[['node',['scripts/check-secrets.mjs']],...['db:test','test:security','test:workflows','test:learning','test:ican','test:admin','test:domain','test:real','test:frontend','test:links','test:seed','test:remediation','test:security-runtime','verify:frozen','type-check','lint','build:web'].map(s=>['npm',['run',s]]),['node',['scripts/test-auth.mjs']],['npm',['audit','--audit-level=high']],['npm',['--prefix','web','audit','--audit-level=high']]];
for(const [cmd,args] of checks){const result=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:false});if(result.status!==0){console.error('Release check failed:',cmd,args.join(' '));process.exit(result.status??1);}}
console.log('Local release checks passed. Production deployment still requires staging acceptance and human approval.');

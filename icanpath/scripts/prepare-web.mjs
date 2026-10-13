/** Publish the existing marketing site and compiled LMS under one Next.js origin. */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PWA_HEAD_HTML } from './pwa-head.mjs';
const root=resolve(import.meta.dirname,'..');
const target=resolve(root,'web/public');
mkdirSync(target,{recursive:true});
const entries=['index.html','ican.html','course.html','course_details.html','about.html','pricing.html','contact.html','404.html','thank-you.html','favicon.svg','manifest.webmanifest','sw.js','register-sw.js','assets','build','student','tutor','admin','login','register','forgot-password','reset-password','pending','suspended'];
for(const entry of entries){
 // Copy only production output: never source modules, credentials, or PHP code.
 cpSync(resolve(root,'dist',entry),resolve(target,entry),{recursive:true});
}
/* The homepage source is frozen, so the published copy is the only place the
   PWA install metadata can be added to it. This is deliberate and idempotent:
   it never touches the frozen source and re-running leaves the copy intact. */
const home=resolve(target,'index.html');
const published=readFileSync(home,'utf8');
if(!published.includes('<link rel="manifest"')){
 if(!published.includes('</head>')){console.error('prepare-web: homepage has no </head> to inject PWA head into');process.exit(1);}
 writeFileSync(home,published.replace('</head>',PWA_HEAD_HTML+'</head>'));
}

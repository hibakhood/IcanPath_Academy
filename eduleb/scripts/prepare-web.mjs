/** Publish the existing marketing site and compiled LMS under one Next.js origin. */
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const target=resolve(root,'web/public');
mkdirSync(target,{recursive:true});
const entries=['index.html','ican.html','course.html','course_details.html','about.html','pricing.html','contact.html','404.html','thank-you.html','favicon.svg','assets','build','student','tutor','admin','mfa','login','register','forgot-password','reset-password','pending','suspended'];
for(const entry of entries){
 // Copy only production output: never source modules, credentials, or PHP code.
 cpSync(resolve(root,'dist',entry),resolve(target,entry),{recursive:true});
}

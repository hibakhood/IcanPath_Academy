import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../assets/js/lms/auth.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source.replace(/^import .*;$/gm, ''), {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
let response = {data:{session:null,user:{email_confirmed_at:null}},error:null};
const redirects=[];
let profile={id:'tutor',role:'tutor',status:'pending'};
const context = vm.createContext({exports:{},console,URL,URLSearchParams,
  window:{location:{origin:'https://learning.example',pathname:'/tutor/dashboard/',search:'',replace:path=>redirects.push(path)}},
  config:{preview:false},friendlyError:error=>error.message,
  supabase:()=>({auth:{signUp:async()=>response,getSession:async()=>({data:{session:{user:{id:'tutor'}}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>profile})})})}),
  unwrap:async promise=>promise,
});
vm.runInContext(compiled,context);
const {destinationFor,signUp,requireRole}=context.exports;
for (const role of ['student','tutor','admin']) {
  const active={role,status:'active'};
  assert.equal(destinationFor(active),`/${role}/dashboard/`);
  assert.equal(destinationFor(active,`/${role}/courses/?id=one#module`),`/${role}/courses/?id=one#module`);
  for(const next of ['//evil.example','/\\evil.example','/student/../../login/','/login/','https://evil.example','/other/dashboard/']) {
    assert.equal(destinationFor(active,next),`/${role}/dashboard/`);
  }
  assert.equal(destinationFor({...active,status:'suspended'}),'/suspended/');
}
assert.equal(destinationFor(profile,'/tutor/courses/'),'/pending/');
assert.equal(await requireRole('tutor'),null);
assert.equal(redirects.pop(),'/pending/');
const input={email:'test@example.com',password:'test only',fullName:'Test',requestedRole:'student'};
assert.equal((await signUp(input)).needsConfirmation,true);
response={data:{session:{user:{id:'student'}}},error:null};
assert.equal((await signUp(input)).needsConfirmation,false);
response={data:{},error:{message:'Unable to create account'}};
await assert.rejects(signUp(input),/Unable to create account/);
console.log('Auth checks passed: role redirects, safe return links, pending and suspended access, signup confirmation, and signup errors.');

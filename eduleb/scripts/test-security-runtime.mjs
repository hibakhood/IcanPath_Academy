import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
import {z} from '../web/node_modules/zod/index.js';
let count=0;const checked=()=>count++;
const root=new URL('../',import.meta.url);
const authSource=readFileSync(new URL('assets/js/lms/auth.ts',root),'utf8');
let logoutError=null;let localCleared=false;let level='aal1';let clear=0;const redirects=[];
const profile={id:'admin',role:'admin',status:'active'};
const context=vm.createContext({exports:{},console,URL,URLSearchParams,
 window:{location:{origin:'https://academy.example',pathname:'/admin/dashboard/',search:'',replace:v=>redirects.push(v)}},
 document:{getElementById:()=>({replaceChildren:()=>clear++})},config:{preview:false},unwrap:async p=>p,
 supabase:()=>({auth:{signOut:async()=>{localCleared=true;return {error:logoutError};},getSession:async()=>({data:{session:localCleared ? null : {user:{id:'admin'}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level},error:null})}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>profile})})})})});
vm.runInContext(ts.transpile(authSource.replace(/^import .*;$/gm,''),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),context);
assert.equal(await context.exports.requireRole('admin'),null);assert.equal(redirects.pop(),'/mfa/');checked();
level='aal2';assert.equal((await context.exports.requireRole('admin')).profile.id,'admin');checked();
assert.equal((await context.exports.signOut()).remoteRevoked,true);assert.equal(clear,1);checked();
logoutError={message:'network'};await assert.rejects(context.exports.signOut(),/could not confirm/);assert.equal(redirects.pop(),'/login/?notice=logout-local');assert.equal(clear,2);checked();
const route=readFileSync(new URL('web/src/app/contact.php/route.ts',root),'utf8');let rpcCalls=0;let rpcError=null;
const env={NEXT_PUBLIC_SUPABASE_URL:'https://backend.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key',CONTACT_TRUSTED_IP_HEADER:'x-trusted-ip',CONTACT_IP_HASH_SECRET:'synthetic-test-secret-at-least-32-characters'};
const routeContext=vm.createContext({exports:{},process:{env},console:{error:()=>{}},z,createHmac,isIP,URL,Response,Blob,Uint8Array,
 createClient:(_url,key)=>{assert.equal(key,env.SUPABASE_SERVICE_ROLE_KEY);return {rpc:async(name,args)=>{assert.equal(name,'submit_trusted_contact');assert.match(args.p_source,/^[a-f0-9]{64}$/);rpcCalls++;return {error:rpcError};}};}});
vm.runInContext(ts.transpile(route.replace(/^import .*;$/gm,''),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),routeContext);
const make=(headers={},fields={})=>new Request('https://academy.example/contact.php',{method:'POST',headers:{'x-trusted-ip':'192.0.2.1',...headers},body:new URLSearchParams({name:'Synthetic Visitor',email:'visitor@example.test',message:'Synthetic message only',...fields})});
assert.equal((await routeContext.exports.POST(make({origin:'https://other.example'}))).status,403);checked();
assert.equal((await routeContext.exports.POST(make({'x-trusted-ip':'invalid'}))).status,503);checked();
assert.equal((await routeContext.exports.POST(make({}, {email:'invalid'}))).status,422);checked();
assert.equal((await routeContext.exports.POST(make({}, {company_website:'bot'}))).status,200);assert.equal(rpcCalls,0);checked();
assert.equal((await routeContext.exports.POST(make())).status,200);assert.equal(rpcCalls,1);checked();
assert.equal((await routeContext.exports.POST(make({}, {message:'a'.repeat(22000)}))).status,413);checked();
rpcError={code:'P0001'};assert.equal((await routeContext.exports.POST(make())).status,429);checked();
const config=readFileSync(new URL('web/next.config.ts',root),'utf8');assert.ok(config.includes('Content-Security-Policy-Report-Only'));assert.ok(!config.includes('unsafe-inline')&&!config.includes('unsafe-eval'));assert.ok(config.includes('X-Content-Type-Options'));checked();
console.log('Runtime security checks:',count,'passed. Mocked Auth and contact backend; no live provider claims.');

import assert from 'node:assert/strict';
import {bootstrapDatabase,as} from './pg-harness.mjs';
const db=await bootstrapDatabase();let count=0;
async function run(role,uid,sql,expected=true){const r=await as(db,role,uid,sql);assert.equal(r.ok,expected,r.error);count++;return r.rows;}
try{
 const {rows:[a,b]}=await db.query(`insert into auth.users(email) values('a@domain.test'),('b@domain.test') returning id`);
 const own=await run('authenticated',a.id,`select user_id from public.student_profiles`);assert.equal(own.length,1);assert.equal(own[0].user_id,a.id);count++;
 await run('authenticated',a.id,`update public.student_profiles set learning_goal='Prepare for exams' where user_id=auth.uid()`);
 const foreign=await run('authenticated',a.id,`select user_id from public.student_profiles where user_id='${b.id}'`);assert.equal(foreign.length,0);count++;
 await run('authenticated',a.id,`insert into public.platform_settings(key,value) values('site_name','"hacked"')`,false);
 const rows=await run('anon',null,`select id from public.public_resources`);assert.equal(rows.length,0);count++;
 await run('anon',null,`select id from public.course_categories`);
 await run('anon',null,`select email from public.contact_messages`,false);
 await run('anon',null,`select public.submit_contact_message('Student','reader@example.test','','Study question','Please explain the course enrollment process.')`,false);
 for(let i=0;i<3;i++)await run('service_role',null,`select public.submit_trusted_contact('${'c'.repeat(64)}','Student','reader@example.test','','Study question','Please explain the course enrollment process.')`);
 await run('service_role',null,`select public.submit_trusted_contact('${'c'.repeat(64)}','Student','reader@example.test','','Study question','Please explain the course enrollment process.')`,false);
 const privateMessages=await run('authenticated',a.id,`select email from public.contact_messages`);assert.equal(privateMessages.length,0);count++;
 await db.query(`update public.profiles set role='admin' where id=$1`,[b.id]);
 const messages=await run('authenticated',b.id,`select email from public.contact_messages`);assert.equal(messages.length,3);count++;
 await run('authenticated',b.id,`insert into public.course_categories(name,slug) values('Foundation','foundation')`);
 const categories=await run('anon',null,`select name from public.course_categories`);assert.equal(categories[0].name,'Foundation');count++;
 console.log(`RESULT: ${count} domain ownership, public access and contact assertions passed.`);
}finally{await db.close();}

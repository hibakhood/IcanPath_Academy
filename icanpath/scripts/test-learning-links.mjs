import assert from 'node:assert/strict';
import { bootstrapDatabase, as } from './pg-harness.mjs';
const db = await bootstrapDatabase();
let checks = 0;
async function allowed(uid,sql) { const result=await as(db,'authenticated',uid,sql); assert.equal(result.ok,true,result.error); checks++; return result.rows; }
async function denied(uid,sql) { const result=await as(db,'authenticated',uid,sql); assert.equal(result.ok,false,'Unexpected access: '+sql); checks++; }
try {
 const {rows: users}=await db.query(`insert into auth.users(email,raw_user_meta_data) values ('teacher@links.test','{"requested_role":"tutor"}'),('student@links.test','{}'),('other@links.test','{}') returning id,email`);
 const tutor=users.find(u=>u.email==='teacher@links.test').id, student=users.find(u=>u.email==='student@links.test').id, other=users.find(u=>u.email==='other@links.test').id;
 await db.query(`update public.profiles set status='active' where id=$1`,[tutor]);
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[tutor]);
 const {rows:[course]}=await db.query(`insert into public.courses(title,created_by) values('Secure course',$1) returning id`,[tutor]);
 const {rows:[module]}=await db.query(`insert into public.modules(course_id,title) values($1,'First module') returning id`,[course.id]);
 const {rows:[lesson]}=await db.query(`insert into public.lessons(course_id,module_id,title,youtube_video_url,is_published) values($1,$2,'Lesson','https://youtu.be/dQw4w9WgXcQ',true) returning id`,[course.id,module.id]);
 await db.query(`update public.courses set status='published' where id=$1`,[course.id]);
 await db.query(`insert into public.course_enrollments(course_id,student_id) values($1,$2)`,[course.id,student]);
 await denied(student,`select public.log_audit('forged','course','${course.id}','{}')`);
 await denied(student,`select public.notify_enrolled_students('${course.id}','account','Forged',null,null)`);
 await denied(student,`select public.notify_role('admin','account','Forged',null,null)`);
 const [material]=await allowed(tutor,`select public.create_link_material('${lesson.id}','Notes','lecture_note',null,'https://drive.google.com/file/d/example/view') as data`);
 const path=material.data.storage_path;
 const [resolved]=await allowed(student,`select public.resolve_learning_link('${path}') as url`);
 assert.equal(resolved.url,'https://drive.google.com/file/d/example/view'); checks++;
 await denied(other,`select public.resolve_learning_link('${path}')`);
 await denied(student,`select public.configure_learning_link('${path}','https://drive.google.com/file/d/changed/view')`);
 await allowed(tutor,`select public.configure_learning_link('${path}','https://drive.google.com/file/d/example/view')`);
 await denied(student,`select destination from public.learning_links`);
 await denied(student,`select public.create_link_material('${lesson.id}','Bad','lecture_note',null,'https://drive.google.com/file/d/example/view')`);
 for(const link of ['javascript:alert(1)','https://drive.google.com.evil.test/file','https://evil.test/?v=dQw4w9WgXcQ','https://user@drive.google.com/file','https://drive.google.com:443/file']) {
  await denied(tutor,`select public.create_link_material('${lesson.id}','Bad','lecture_note',null,'${link}')`);
 }
 await denied(tutor,`update public.lessons set youtube_video_url='https://evil.test/?v=dQw4w9WgXcQ' where id='${lesson.id}'`);
 const [meeting]=await allowed(tutor,`select public.schedule_link_class('${course.id}',null,'Live','google_meet',current_date,'18:00','19:00','https://meet.google.com/abc-defg-hij') as data`);
 const livePath=`courses/${course.id}/live/${meeting.data.id}.url`;
 const [join]=await allowed(student,`select public.resolve_learning_link('${livePath}') as url`);
 assert.equal(join.url,'https://meet.google.com/abc-defg-hij'); checks++;
 await denied(other,`select public.resolve_learning_link('${livePath}')`);
 await denied(tutor,`select public.schedule_link_class('${course.id}',null,'Wrong platform','zoom',current_date,'18:00','19:00','https://meet.google.com/abc-defg-hij')`);
 await db.query(`update public.live_classes set status='cancelled' where id=$1`,[meeting.data.id]);
 await denied(student,`select public.resolve_learning_link('${livePath}')`);
 await db.query(`update public.lessons set is_published=false where id=$1`,[lesson.id]);
 await denied(student,`select public.resolve_learning_link('${path}')`);
 const catalogue=await as(db,'anon',null,`select public.published_course_catalogue('',1) as data`);
 assert.equal(catalogue.ok,true,catalogue.error);assert.equal(catalogue.rows[0].data.courses.length,1);checks++;
 const detail=await as(db,'anon',null,`select public.published_course_detail('${course.id}') as data`);
 assert.equal(detail.ok,true,detail.error);assert.equal(detail.rows[0].data.modules[0].lessons.length,0);checks++;
 const payload=JSON.stringify(detail.rows)+JSON.stringify(catalogue.rows);
 assert.ok(!payload.includes('youtube_video')&&!payload.includes('destination')&&!payload.includes('meet.google')&&!payload.includes('drive.google'));checks++;
 await db.query(`update public.courses set status='draft' where id=$1`,[course.id]);
 const hidden=await as(db,'anon',null,`select public.published_course_detail('${course.id}') as data`);
 assert.equal(hidden.rows[0].data,null);checks++;
 console.log(`RESULT: ${checks} provider-link and public-data assertions passed.`);
} finally {await db.close();}

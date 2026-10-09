import {coursePhoto} from "../course-photo.ts";
import {enrollInCourse,myEnrollments} from '../api.ts';
import {config} from '../config.ts';
import {previewState} from '../preview-data.ts';
import {supabase,unwrap} from '../supabase.ts';
import {action,el,emptyState,input,page,select} from '../ui.ts';
import type {AdminRow} from '../admin-api.ts';
void page({role:'student',title:'Browse courses',base:'/student',active:'/browse/'},async content=>{
 const params=new URLSearchParams(location.search);const q=params.get('q')??'';const level=params.get('level')??'';const current=Math.max(1,Math.min(10000,Number(params.get('page'))||1));const enrollments=await myEnrollments();
 const data=config.preview?{courses:previewState.courses.filter(c=>c.status==='published'&&c.title.toLowerCase().includes(q.toLowerCase())),total:previewState.courses.filter(c=>c.status==='published').length}:await unwrap(supabase().rpc('student_course_catalogue',{p_query:q,p_level:level,p_page:current})) as {courses:AdminRow[];total:number};
 const levels=select([{value:'',label:'All levels'},...['Foundation','Skills','Professional'].map(value=>({value,label:value}))]);levels.name='level';levels.value=level;
 content.append(el('h1',{},'Browse ICAN Courses'),el('form',{method:'get',class:'btn-row'},input({name:'q',type:'search',value:q,maxlength:200,'aria-label':'Course title'}),levels,el('button',{type:'submit',class:'btn'},'Search')));
 const rows=data.courses.filter(c=>!level||c.level===level);
 if(!rows.length)content.append(emptyState('No matching published courses',"Try another search. Courses appear after tutors prepare them and an administrator approves them."));
 for(const course of rows){const enrolled=enrollments.some(e=>e.course_id===course.id&&e.status==='active');content.append(el('section',{class:'card'},el('img',{class:'app-course-photo',src:coursePhoto(String(course.title),typeof course.thumbnail_url==='string'?course.thumbnail_url:null),alt:'',loading:'lazy',decoding:'async'}),el('div',{class:'card__body'},el('h2',{},String(course.title)),el('p',{},String(course.level)),el('p',{},String(course.description??'')),enrolled?el('a',{class:'btn',href:`/student/course/?id=${encodeURIComponent(String(course.id))}`},'Open enrolled course'):el('button',{type:'button',class:'btn btn--primary',onclick:action(async()=>{await enrollInCourse(String(course.id));location.assign(`/student/course/?id=${encodeURIComponent(String(course.id))}`);})},'Enrol in course'))));}
 content.append(el('div',{class:'btn-row'},current>1?el('a',{class:'btn',href:`?q=${encodeURIComponent(q)}&level=${encodeURIComponent(level)}&page=${current-1}`},'Previous'):null,!config.preview&&current*12<data.total?el('a',{class:'btn',href:`?q=${encodeURIComponent(q)}&level=${encodeURIComponent(level)}&page=${current+1}`},'Next'):null));
});

import {listCourses,myEnrollments,coursesFor,listLessons,listMaterials,listQuizzes,courseAssignments,tutorStudentActivity} from '../api.ts';
import {recordingPublisher} from '../recording-publisher.ts';
import {learningWorkspace,learningAction,learningActivity,learningSearch} from '../learning-api.ts';
import {money,type AdminRow} from '../admin-api.ts';
import {action,el,emptyState,field,input,page,select,textarea,fmtDateTime} from '../ui.ts';
const role=location.pathname.startsWith('/tutor/')?'tutor':'student';
const section=location.pathname.split('/').filter(Boolean)[1]??'questions';
const titles:Record<string,string>={lessons:'Lessons',materials:'Materials',quizzes:'Quizzes',assignments:"Past questions",reviews:"Reviews and feedback",questions:"Questions and feedback",earnings:'Earnings',activity:"Recent activity",attempts:'Quiz Attempt Reviews',search:'Search'};
const text=(r:AdminRow,k:string)=>String(r[k]??'');
function table(rows:AdminRow[],columns:[string,string][],controls?:(r:AdminRow)=>HTMLElement):HTMLElement{
 if(!rows.length)return emptyState('Nothing here yet','New records will appear here as you use your courses.');
 return el('div',{class:'app-table-wrap'},el('table',{class:'app-table'},el('thead',{},el('tr',{},...columns.map(([,label])=>el('th',{},label)),controls?el('th',{},'Actions'):null)),el('tbody',{},...rows.map(r=>el('tr',{},...columns.map(([key])=>el('td',{},key==='amount_minor'?money(Number(r[key])/100):key.endsWith('_at')?fmtDateTime(text(r,key)):text(r,key))),controls?el('td',{},controls(r)):null)))));
}
function form(title:string,fields:Record<string,HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>,save:(values:AdminRow)=>Promise<void>):HTMLElement{
 const node=el('form',{class:'card admin-form'},el('h2',{},title),...Object.entries(fields).map(([key,value])=>field(({course_id:'Course',body:'Review',note:'Review note'} as Record<string,string>)[key]??key.replaceAll('_',' '),value)),el('button',{type:'submit',class:'btn btn--primary'},'Save'));
 node.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{const button=node.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;try{const values:AdminRow={};for(const [key,value] of Object.entries(fields))values[key]=value.value;await save(values);location.reload();}finally{button.disabled=false;}})(event);});return node;
}
void page({role,title:titles[section]??'Learning',base:`/${role}`,active:`/${section}/`},async(content)=>{
 content.append(el('div',{class:'section-head section-head--split'},el('h1',{},titles[section]??'Learning'),el('a',{href:`/${role}/dashboard/`,class:'btn btn--sm'},'Dashboard')));
 if(section==='search'){
  const q=new URLSearchParams(location.search).get('q')?.trim()??'';
  const query=input({type:'search',value:q,minlength:2,maxlength:100,name:'q',required:true,'aria-label':'Search your courses'});
  content.append(el('form',{method:'get',class:'btn-row'},query,el('button',{class:'btn',type:'submit'},'Search')),table(q.length>=2?await learningSearch(q):[],[['title','Title'],['kind','Type']],r=>el('a',{class:'btn btn--sm',href:role==='tutor'?`/tutor/course/?id=${encodeURIComponent(text(r,'course_id'))}`:`/student/${r.kind==='lesson'?'lesson':'course'}/?id=${encodeURIComponent(text(r,'id'))}`},'Open')));return;
 }
 if(section==='activity'){
  const rows=role==='student'?await learningActivity():await tutorStudentActivity() as unknown as AdminRow[];
  content.append(el('p',{},role==='student'?"Your latest 100 learning activities.":'Latest activity from students in your courses.'),table(rows,role==='student'?[['title','Activity'],['detail',"Lesson or assessment"],['occurred_at','Time']]:[['student_name','Student'],['action','Activity'],['course_title','Course'],['occurred_at','Time']]));return;
 }
 if(role==='tutor'&&section==='lessons'){await recordingPublisher(content);return;}
 if(role==='tutor'&&section==='assignments'){await recordingPublisher(content,true,true);return;}
 if(role==='tutor'&&section==='materials'){await recordingPublisher(content,true);return;}
 if(role==='tutor'&&['materials','quizzes','assignments'].includes(section)){
  const courses=await listCourses();const rows:AdminRow[]=[];
  for(const course of courses){
   const lessons=await listLessons(course.id);
   const items=section==='lessons'?lessons:section==='quizzes'?await listQuizzes(course.id):section==='assignments'?await courseAssignments(course.id):(await Promise.all(lessons.map(l=>listMaterials(l.id)))).flat();
   for(const item of items)rows.push({id:item.id,title:item.title,course:course.title,course_id:course.id,status:'is_published' in item?(item.is_published?'Published':'Draft'):'Available'});
  }
  content.append(el('p',{},"Open Manage course to add or edit content."),el('a',{class:'btn btn--primary',href:'/tutor/courses/'},'Choose a course'),table(rows,[['title','Title'],['course','Course'],['status','Status']],r=>el('a',{class:'btn btn--sm',href:`/tutor/course/?id=${encodeURIComponent(text(r,'course_id'))}`},"Manage course")));return;
 }
 const hub=await learningWorkspace();content.append(el('p',{class:'learning-muted'},section==='earnings'?'Latest 200 earnings entries.':'Latest 100 feedback and review records.'));
 if(section==='questions'&&role==='student'){
  const enrollments=await myEnrollments();const courses=await coursesFor(enrollments.filter(e=>e.status==='active').map(e=>e.course_id));
  if(courses.length){const choices=courses.map(c=>({value:c.id,label:c.title}));
   content.append(form('Ask your tutor',{course_id:select(choices),question:textarea({required:true,minlength:10,maxlength:2000,rows:4})},async v=>learningAction('question',null,v)),el('p',{},"Only you and your course tutors can see these questions."));
  }else content.append(emptyState('Enrol in a course to ask a question or leave a review'));
  content.append(el('h2',{},'Your questions'),table(hub.questions,[['course','Course'],['question','Question'],['answer','Tutor answer'],['created_at','Asked']]));
 }
 if(role==='tutor'&&['questions','reviews','attempts'].includes(section)){
  const rows=section==='questions'?hub.questions:section==='reviews'?hub.reviews:hub.quiz_reviews;
  content.append(table(rows,section==='questions'?[['student','Student'],['course','Course'],['question','Question'],['answer','Answer']]:section==='reviews'?[['student','Student'],['course','Course'],['rating','Stars'],['body','Review'],['tutor_reply','Reply']]:[['student','Student'],['title','Quiz'],['percentage','Score (%)'],['status','Review status'],['note','Review note']],r=>{
   if(section==='attempts'&&r.status==='reviewed')return el('span',{},'Reviewed');
   const key=section==='questions'?'answer':section==='reviews'?'reply':'note';
   return form(section==='questions'?'Answer question':section==='reviews'?'Reply to review':'Acknowledge attempt',{[key]:textarea({required:section!=='attempts',minlength:section!=='attempts'?1:0,maxlength:section==='questions'?5000:2000,rows:2,value:section==='questions'?text(r,'answer'):section==='reviews'?text(r,'tutor_reply'):text(r,'note')})},async v=>learningAction(section==='questions'?'answer':section==='reviews'?'reply':'quiz_review',text(r,'id'),v));
  }));if(section==='attempts')content.append(el('p',{},"The app scores these quizzes automatically. Reviewing an attempt records that you have checked it. The score stays the same."));
 }
 if(section==='earnings'&&role==='tutor')content.append(el('div',{class:'stat-grid'},...([['Earned',hub.earned],['Paid',hub.paid],['Balance',hub.earned-hub.paid]] as const).map(([label,value])=>el('div',{class:'stat'},el('span',{class:'stat__label'},label),el('strong',{class:'stat__value'},money(value))))),el('p',{},"An administrator records confirmed earnings, corrections and payments here. Payment records refer to money paid outside this app."),table(hub.earnings,[['kind','Type'],['amount_minor','Amount (NGN)'],['reference','Reference'],['note','Note'],['created_at','Recorded']]));
});

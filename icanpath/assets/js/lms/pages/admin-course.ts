import {coursePreview} from '../course-preview.ts';
import {listProfiles} from '../api.ts';
import {supabase,unwrap} from '../supabase.ts';
import {config} from '../config.ts';
import {action,select,toast} from '../ui.ts';
import {getCourse,listQuizzes,courseAssignments,courseLiveClasses} from '../api.ts';
import {el,emptyState,page} from '../ui.ts';
void page({role:'admin',title:'Course details',base:'/admin',active:'/courses/'},async(content)=>{
 const id=new URLSearchParams(location.search).get('id');if(!id){content.append(emptyState('Choose a course'));return;}
 const course=await getCourse(id);if(!course){content.append(emptyState('Course unavailable'));return;}
 const [quizzes,assignments,classes]=await Promise.all([listQuizzes(id),courseAssignments(id),courseLiveClasses(id)]);
 content.append(el('h1',{},course.title),el('p',{},course.description??''),el('div',{class:'btn-row'},el('a',{class:'btn',href:'/admin/courses/'},'All courses'),el('a',{class:'btn',href:`/admin/review/?course=${encodeURIComponent(id)}`},'Review course')),el('p',{},`${course.status} · ${quizzes.length} quizzes · ${assignments.length} assignments · ${classes.length} live classes`));
 content.append(await coursePreview(id));
 const teachers=(await listProfiles()).filter(p=>p.role==='tutor'&&p.status==='active');const teacher=select(teachers.map(p=>({value:p.id,label:p.full_name??p.id})),{'aria-label':'Assign tutor'});
 content.append(el('section',{class:'card'},el('div',{class:'card__body'},el('h2',{},'Assign teaching tutor'),teacher,el('button',{class:'btn',type:'button',onclick:action(async()=>{if(config.preview)throw new Error("A tutor cannot be assigned until the app has a database connection.");await unwrap(supabase().from('course_tutors').insert({course_id:id,user_id:teacher.value,assigned_by:(await supabase().auth.getUser()).data.user?.id}));toast('Tutor assigned.');})},'Assign tutor'))));
});

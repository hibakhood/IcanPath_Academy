import {config} from '../config.ts';
import {supabase,unwrap} from '../supabase.ts';
import {assessmentWorkspace} from '../assessment-api.ts';
import type {AppRole} from '../types.ts';
import type {AdminRow} from '../admin-api.ts';
import {el,emptyState,input,page,fmtDateTime} from '../ui.ts';
const role=location.pathname.split('/')[1] as AppRole;
void page({role,title:"Assessment results",base:`/${role}`,active:'/performance/'},async content=>{
 const [native,quiz,assignment]=await Promise.all([config.preview?Promise.resolve({quizzes:[],assignments:[]}):unwrap(supabase().rpc('learning_performance')) as Promise<{quizzes:AdminRow[];assignments:AdminRow[]}>,assessmentWorkspace('quiz'),assessmentWorkspace('assignment')]);
 content.append(el('h1',{},role==='student'?"My assessment results":"Student assessment results"),el('p',{},"Lesson progress and assessment results are shown separately. Tutors confirm results for linked assessments. Students only see marks after tutors release them. This page shows up to 1,000 results from the app and 200 linked submissions of each type."));
 const entries:AdminRow[]=[...native.quizzes.map(r=>({...r,kind:'Quiz in the app',result:r.percentage===null?'In progress':`${r.percentage}% ${r.passed?'· Passed':'· Not passed'}`})),...native.assignments.map(r=>({...r,kind:'Assignment in the app',result:r.score===null?"Waiting for marks":`${r.score} / ${r.max_score}`,feedback:r.feedback})),...[...quiz.submissions,...assignment.submissions].map(r=>({...r,kind:'Linked assessment',result:r.score===null?"Waiting for marks":`${r.score} / ${r.max_score}`,feedback:r.feedback}))];
 const cards=entries.map(r=>el('article',{class:'card'},el('div',{class:'card__body'},el('h2',{},String(r.title)),role!=='student'?el('p',{},String(r.student)):null,el('p',{},`${r.kind} · ${'course' in r?r.course:''}`),el('strong',{},String(r.result)),'feedback' in r&&r.feedback?el('p',{},String(r.feedback)):null,el('small',{},r.submitted_at?fmtDateTime(String(r.submitted_at)):'In progress'))));
 const filter=input({type:'search','aria-label':'Filter assessment performance',placeholder:'Filter by student, course or assessment'});filter.addEventListener('input',()=>{for(const card of cards)card.hidden=!card.textContent?.toLowerCase().includes(filter.value.toLowerCase());});content.append(filter,cards.length?el('div',{class:'app-stack'},...cards):emptyState('No assessment results yet'));
});

import {config} from './config.ts';
import {supabase,unwrap} from './supabase.ts';
import {previewState,previewPersonaId} from './preview-data.ts';
import type {AdminRow} from './admin-api.ts';
export interface LearningWorkspace {questions:AdminRow[];reviews:AdminRow[];quiz_reviews:AdminRow[];certificates:AdminRow[];earnings:AdminRow[];earned:number;paid:number;unanswered:number;pending_quiz_reviews:number;unreplied_reviews:number;unread_messages:number}
export async function learningWorkspace():Promise<LearningWorkspace>{if(config.preview)return {questions:[],reviews:[],quiz_reviews:[],certificates:[],earnings:[],earned:0,paid:0,unanswered:0,pending_quiz_reviews:0,unreplied_reviews:0,unread_messages:0};return await unwrap(supabase().rpc('learning_workspace')) as LearningWorkspace;}
export async function learningAction(action:string,id:string|null,payload:AdminRow):Promise<void>{if(config.preview)throw new Error("Learning changes cannot be saved until the app has a database connection.");await unwrap(supabase().rpc('learning_action',{p_action:action,p_id:id,p_payload:payload}));}
export async function learningActivity():Promise<AdminRow[]>{
 if(config.preview){const uid=previewState.profile?.id??previewPersonaId('student');return previewState.progress.filter(p=>p.student_id===uid&&p.completed).map(p=>({title:'Lesson completed',detail:previewState.lessons.find(l=>l.id===p.lesson_id)?.title??'Lesson',occurred_at:new Date().toISOString(),icon:'book',href:`/student/lesson/?id=${encodeURIComponent(p.lesson_id)}`}));}
 return await unwrap(supabase().rpc('my_learning_activity')) as AdminRow[];
}
export async function learningSearch(term:string):Promise<AdminRow[]>{
 if(config.preview){const uid=previewState.profile?.id??'';const allowed=new Set(previewState.enrollments.filter(e=>e.student_id===uid&&e.status==='active').map(e=>e.course_id));for(const c of previewState.courses)if(c.created_by===uid)allowed.add(c.id);return [...previewState.courses.filter(c=>allowed.has(c.id)&&c.title.toLowerCase().includes(term.toLowerCase())).map(c=>({id:c.id,title:c.title,kind:'course',course_id:c.id})),...previewState.lessons.filter(l=>allowed.has(l.course_id)&&l.is_published&&l.title.toLowerCase().includes(term.toLowerCase())).map(l=>({id:l.id,title:l.title,kind:'lesson',course_id:l.course_id}))].slice(0,30);}
 return await unwrap(supabase().rpc('learning_search',{p_term:term})) as AdminRow[];
}
export async function joinClass(id:string):Promise<void>{
 if(config.preview)throw new Error('Meeting links are unavailable in preview mode.');
 const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
 try{const url=await unwrap(supabase().rpc('join_learning_class',{p_class:id})) as string;if(tab)tab.location.href=url;else window.location.assign(url);}catch(error){tab?.close();throw error;}
}
export async function issueCertificate(id:string):Promise<void>{if(config.preview)throw new Error("Certificates cannot be issued until the app has a database connection.");await unwrap(supabase().rpc('issue_course_certificate',{p_course_id:id}));}
export async function recordEarning(payload:AdminRow):Promise<void>{if(config.preview)throw new Error("Earnings cannot be recorded until the app has a database connection.");await unwrap(supabase().rpc('record_tutor_earning',{p_tutor:payload.tutor_id,p_kind:payload.kind,p_amount:Math.round(Number(payload.amount)*100),p_reference:payload.reference,p_payment:payload.payment_id||null,p_original:payload.original_entry_id||null,p_note:payload.note||null}));}

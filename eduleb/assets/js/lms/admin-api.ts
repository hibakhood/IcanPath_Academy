import {config} from './config.ts';
import {supabase,unwrap} from './supabase.ts';
import {previewState,previewAnalyticsData} from './preview-data.ts';
import type {AnalyticsData} from './types.ts';
export type AdminRow=Record<string,unknown>;
export interface AdminWorkspace {payments:AdminRow[];requests:AdminRow[];reports:AdminRow[];messages:AdminRow[];enrollments:AdminRow[];classes:AdminRow[];audit:AdminRow[];settings:AdminRow[];runs:AdminRow[];monitoring:AdminRow|null;pending_requests:number;open_reports:number;unread_messages:number;revenue:number}
const demo:AdminWorkspace={payments:[],requests:[],reports:[],messages:[],enrollments:[],classes:[],audit:[],settings:[],runs:[],monitoring:null,pending_requests:0,open_reports:0,unread_messages:0,revenue:0};
export async function workspace():Promise<AdminWorkspace>{
 if(config.preview)return {...demo,enrollments:previewState.enrollments.map(e=>({...e,student:previewState.profiles.find(p=>p.id===e.student_id)?.full_name,course:previewState.courses.find(c=>c.id===e.course_id)?.title})),classes:previewState.liveClasses.map(l=>({...l,course:previewState.courses.find(c=>c.id===l.course_id)?.title}))};
 return await unwrap(supabase().rpc('admin_workspace')) as AdminWorkspace;
}
export async function dateMetrics(start:string,end:string):Promise<AnalyticsData>{
 if(config.preview){const labels:string[]=[];const begin=new Date(start+'T00:00:00Z'),finish=new Date(end+'T00:00:00Z');for(let i=0;begin<=finish&&i<367;i++,begin.setUTCDate(begin.getUTCDate()+1))labels.push(begin.toLocaleDateString('en-NG',{month:'short',day:'numeric',timeZone:'UTC'}));const illustration=previewAnalyticsData();return {labels,students:labels.map((_,i)=>Math.round((illustration.students[i%illustration.students.length]??0)/100)),enrollments:labels.map((_,i)=>Math.round((illustration.enrollments[i%illustration.enrollments.length]??0)/100)),revenue:labels.map((_,i)=>(illustration.revenue?.[i%(illustration.revenue?.length||1)]??0)*100)};}
 return await unwrap(supabase().rpc('admin_date_metrics',{p_start:start,p_end:end})) as AnalyticsData;
}
export async function operate(action:string,id:string|null,payload:AdminRow={}):Promise<{id:string;data?:AnalyticsData}>{
 if(config.preview)throw new Error("Changes cannot be saved in demo mode. The app needs a database connection.");
 return await unwrap(supabase().rpc('admin_operation',{p_action:action,p_id:id,p_payload:payload})) as {id:string;data?:AnalyticsData};
}
export async function searchAdmin(term:string):Promise<AdminRow[]>{
 if(config.preview)return [...previewState.profiles.filter(p=>(p.full_name??'').toLowerCase().includes(term.toLowerCase())).map(p=>({id:p.id,title:p.full_name,kind:'user'})),...previewState.courses.filter(c=>c.title.toLowerCase().includes(term.toLowerCase())).map(c=>({id:c.id,title:c.title,kind:'course',course_id:c.id})) ,...previewState.lessons.filter(l=>l.title.toLowerCase().includes(term.toLowerCase())).map(l=>({id:l.id,title:l.title,kind:'lesson',course_id:l.course_id}))].slice(0,30);
 return await unwrap(supabase().rpc('admin_search',{p_term:term})) as AdminRow[];
}
export function dateRange(days=30):{start:string;end:string}{const end=new Date();const start=new Date();start.setDate(start.getDate()-days+1);return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};}
export function money(value:number):string{return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value);}
export function downloadReport(data:AnalyticsData):void{
 const quote=(s:unknown)=>'"'+String(s??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';
 const csv=['Date,New students,Enrollments',...data.labels.map((label,i)=>[label,data.students[i],data.enrollments[i]].map(quote).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ican-admin-report.csv';a.click();URL.revokeObjectURL(url);
}

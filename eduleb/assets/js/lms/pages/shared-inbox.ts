import {config} from '../config.ts';
import {supabase,unwrap} from '../supabase.ts';
import type {AppRole} from '../types.ts';
import {action,el,emptyState,fmtDateTime,page,toast} from '../ui.ts';
const role=location.pathname.split('/')[1] as AppRole;
void page({role,title:'Messages',base:`/${role}`,active:'/messages/'},async(content)=>{
 const rows=config.preview?[]:await unwrap(supabase().from('inbox_messages').select('*').order('created_at',{ascending:false}).limit(200)) as Record<string,unknown>[];
 content.append(el('h1',{},'Messages'),rows.length?el('div',{class:'app-stack'},...rows.map(row=>el('article',{class:'card'},el('h2',{},String(row.subject)),el('p',{},String(row.body)),el('small',{},fmtDateTime(String(row.created_at))),row.read_at?el('span',{},'Read'):el('button',{class:'btn btn--sm',type:'button',onclick:action(async()=>{await unwrap(supabase().from('inbox_messages').update({read_at:new Date().toISOString()}).eq('id',String(row.id)));toast('Marked as read.');location.reload();})},"Mark as read")))):emptyState('No messages yet','Messages from your administrator will appear here.'));
});

// Historical routes retain their URLs while returning to the learning workspace.
import {page,el} from '../ui.ts';
const role=location.pathname.split('/')[1] as 'student'|'tutor'|'admin';
void page({role,title:"Your learning dashboard",base:`/${role}`,active:'/dashboard/'},content=>{
 content.append(el('h1',{},"Your learning dashboard"),el('p',{},'Use your dashboard to manage courses, classes, assessments and learning progress.'),el('a',{class:'btn btn--primary',href:`/${role}/dashboard/`},'Open dashboard'));
});

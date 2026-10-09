import {continueLearning,coursesFor,myCourseProgress,myEnrollments,myUpcomingClasses,notifications,studentDashboardStats,markNotificationRead} from '../api.ts';
import {learningActivity,learningWorkspace,joinClass} from '../learning-api.ts';
import type {AdminRow} from '../admin-api.ts';
import type {AppNotification,ContinueLearning,Course,CourseProgress,LiveClass,StudentStats} from '../types.ts';
import {action,el,emptyState,fmtClock,fmtRelative,icon,page,platformLabel,progressBar,setChildren} from '../ui.ts';
void page({role:'student',title:"Student dashboard",base:'/student',active:'/dashboard/'},async(content,session)=>{
 const [stats,enrollments,progress,upcoming,feed,activity,hub]=await Promise.all([studentDashboardStats(),myEnrollments(),myCourseProgress(),myUpcomingClasses(),notifications(),learningActivity(),learningWorkspace()]);
 const courses=await coursesFor(enrollments.filter(e=>e.status==='active').map(e=>e.course_id));let next:ContinueLearning|undefined;
 for(const row of progress.filter(p=>p.percentage<100)){next=(await continueLearning(row.course_id))[0];if(next)break;}
 const classes=upcoming.filter(c=>c.status==='live'||(c.status==='scheduled'&&c.scheduled_date>=new Date().toISOString().slice(0,10))).sort((a,b)=>(a.scheduled_date+a.start_time).localeCompare(b.scheduled_date+b.start_time));
 setChildren(content,el('header',{class:'learning-welcome'},el('h1',{},`Welcome back, ${session.profile.full_name?.split(' ')[0]??'there'}! 👋`),el('p',{},"Ready to keep studying?")),
 el('div',{class:'student-layout'},resumeCard(next),nextClass(classes[0],courses),progressCard(stats,hub.certificates.length),coursesCard(courses,progress),classesCard(classes,courses),activityCard(activity,feed)));
});
function resumeCard(next:ContinueLearning|undefined):HTMLElement{
 const card=el('section',{class:'dash-card student-resume'});if(!next){card.append(el('h2',{},'Continue learning'),emptyState('Ready for your next lesson?',el('a',{class:'btn btn--primary',href:'/student/courses/'},'Explore my courses')));return card;}
 card.append(el('button',{class:'resume-dismiss',type:'button','aria-label':'Dismiss continue learning',onclick:()=>{card.hidden=true;}},'×'),el('h2',{},'Continue learning'),el('strong',{},next.course_title),el('p',{},`${next.module_title}: ${next.lesson_title}`),el('small',{},`${next.percentage}% Complete`),el('a',{class:'btn btn--primary',href:`/student/lesson/?id=${encodeURIComponent(next.lesson_id)}`},'Continue learning'));
 // Dismissal lasts for the current dashboard visit; the course cards always retain Continue links.
 return card;
}
function coursesCard(courses:Course[],progress:CourseProgress[]):HTMLElement{
 return el('section',{class:'dash-card student-courses'},head("My courses",'/student/courses/'),courses.length?el('div',{class:'student-course-grid'},...courses.slice(0,4).map((c,i)=>{
 const row=progress.find(p=>p.course_id===c.id);const pct=row?.percentage??0;
 return el('article',{class:'learning-course-card'},cover(c.thumbnail_url,i),el('h3',{},c.title),el('div',{class:'learning-course-progress'},el('small',{},`${pct}% Complete`),progressBar(pct)),el('small',{class:'learning-muted'},row?`${row.completed_lessons} of ${row.total_lessons} lessons complete`:'No published lessons yet'),el('a',{class:'btn btn--sm learning-outline',href:`/student/course/?id=${encodeURIComponent(c.id)}`},'Continue'));
 })):emptyState('No enrolled courses yet',el('a',{class:'btn',href:'/student/courses/'},'Browse courses')));
}
function nextClass(cls:LiveClass|undefined,courses:Course[]):HTMLElement{
 return el('section',{class:'dash-card student-next'},el('h2',{},"Upcoming live class"),cls?el('div',{class:'learning-next-content'},el('div',{class:'learning-class-row'},el('span',{class:'learning-class-icon'},icon('calendar')),el('div',{},el('strong',{},cls.title),el('small',{},courseName(cls,courses)))),el('p',{},icon('calendar'),`${fmtRelative(cls.scheduled_date)} · ${fmtClock(cls.start_time)} ${cls.timezone??'Africa/Lagos'}`),el('p',{},icon('video'),platformLabel(cls.platform)),joinButton(cls,'Join Class')):emptyState('No upcoming class','Your next scheduled class will appear here.'));
}
function classesCard(classes:LiveClass[],courses:Course[]):HTMLElement{
 return el('section',{class:'dash-card student-upcoming'},head("Upcoming live classes",'/student/live/'),classes.length?el('ul',{class:'learning-class-list'},...classes.slice(0,3).map(cls=>el('li',{class:'learning-class-row'},el('span',{class:'learning-class-icon'},icon('video')),el('div',{class:'learning-class-copy'},el('strong',{},cls.title),el('small',{},courseName(cls,courses)),el('small',{},`${cls.scheduled_date} · ${fmtClock(cls.start_time)} ${cls.timezone??'Africa/Lagos'}`)),el('span',{class:'learning-provider'},platformLabel(cls.platform)),joinButton(cls,'Join')))):emptyState('No classes scheduled'));
}
function joinButton(cls:LiveClass,label:string):HTMLButtonElement{return el('button',{class:'btn btn--sm learning-outline',type:'button',onclick:action(async()=>joinClass(cls.id))},label);}
function progressCard(stats:StudentStats,_certificates:number):HTMLElement{
 const rows=[["Completed courses",stats.completed],["In progress",stats.in_progress],['Pending',Math.max(0,stats.enrolled_courses-stats.completed-stats.in_progress)],["Enrolled courses",stats.enrolled_courses]] as const;
 return el('section',{class:'dash-card student-progress'},el('h2',{},"Lesson progress"),el('div',{class:'learning-progress-layout'},el('div',{class:'dash-donut__ring',style:`--pct:${stats.overall_progress}`},el('div',{class:'dash-donut__inner'},el('strong',{},`${stats.overall_progress}%`),el('small',{},"Lesson progress"))),el('ul',{class:'learning-progress-legend'},...rows.map(([label,count],i)=>el('li',{},el('span',{class:`learning-dot learning-dot--${i}`}),el('span',{},label),el('strong',{},String(count)))))));
}
function activityCard(activity:AdminRow[],feed:AppNotification[]):HTMLElement{
 const recent=el('div',{id:'student-recent-panel',role:'tabpanel'},activity.length?el('ul',{class:'learning-feed'},...activity.slice(0,4).map(r=>el('li',{},el('span',{class:'learning-feed-icon'},icon(String(r.icon))),el('div',{},el('a',{href:String(r.href)},el('strong',{},String(r.title))),el('small',{},String(r.detail))),el('time',{},fmtRelative(String(r.occurred_at)))))):emptyState('No learning activity yet'));
 const notices=el('div',{id:'student-notifications-panel',role:'tabpanel',hidden:true},feed.length?el('ul',{class:'learning-feed'},...feed.slice(0,4).map(r=>el('li',{},el('span',{class:'learning-feed-icon'},icon('bell')),el('div',{},el('a',{href:r.link_path??'/student/announcements/',onclick:()=>{void markNotificationRead(r.id).catch(()=>{});}},el('strong',{},r.title)),el('small',{},r.body??'')),el('time',{},fmtRelative(r.created_at))))):emptyState('No notifications yet'));
 const first=el('button',{type:'button',role:'tab',class:'dash-tab is-active','aria-selected':true,'aria-controls':recent.id},"Recent activity");const second=el('button',{type:'button',role:'tab',class:'dash-tab','aria-selected':'false','aria-controls':notices.id},'Notifications',el('span',{class:'dash-tab__badge'},String(feed.filter(n=>!n.read_at).length)));
 const choose=(one:boolean)=>{recent.hidden=!one;notices.hidden=one;first.classList.toggle('is-active',one);second.classList.toggle('is-active',!one);first.setAttribute('aria-selected',String(one));second.setAttribute('aria-selected',String(!one));first.tabIndex=one?0:-1;second.tabIndex=one?-1:0;};first.addEventListener('click',()=>choose(true));second.addEventListener('click',()=>choose(false));second.tabIndex=-1;
 for(const tab of [first,second])tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const one=tab===second;choose(one);(one?first:second).focus();}});
 return el('section',{class:'dash-card student-activity'},el('div',{class:'dash-tabs',role:'tablist','aria-label':'Learning updates'},first,second),recent,notices,el('a',{class:'btn btn--sm learning-view-all',href:'/student/activity/'},"View all activity"));
}
function head(title:string,href:string):HTMLElement{return el('div',{class:'dash-card__head'},el('h2',{},title),el('a',{class:'dash-card__link',href},"View all"));}
function cover(url:string|null,index:number):HTMLElement{return url&&/^https:\/\//.test(url)?el('img',{src:url,alt:'',class:'learning-cover',loading:'lazy',referrerpolicy:'no-referrer'}):el('img',{src:`/assets/img/course/${index%6+1}.jpg`,alt:'Illustrative course cover',class:'learning-cover',loading:'lazy'});}
function courseName(cls:LiveClass,courses:Course[]):string{return courses.find(c=>c.id===cls.course_id)?.title??'Your course';}

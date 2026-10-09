import type {CourseStatus} from './types.ts';
import {pill} from './ui.ts';
export function courseBadge(course:{status:CourseStatus}):HTMLElement {return pill(course.status==='pending_review'?'Awaiting review':course.status.replaceAll('_',' '),course.status==='published'?'done':course.status==='pending_review'?'soon':'default');}

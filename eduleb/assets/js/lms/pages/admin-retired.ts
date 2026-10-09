// Removed administration features retain safe destinations for existing bookmarks.
import {requireRole} from '../auth.ts';
void requireRole('admin').then(session=>{if(session)location.replace(location.pathname.includes('notifications')?'/admin/announcements/':'/admin/dashboard/');});

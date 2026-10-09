import "server-only";
import { createClient } from "@supabase/supabase-js";
import { backendConfigured } from "./config";
export interface Course { id: string; title: string; description: string | null; level: string | null; tutor_name: string | null; }
export interface CourseDetail extends Course { modules: { id: string; title: string; lessons: {id: string; title: string}[] }[] }
export async function catalogue(query = "", page = 1): Promise<{courses: Course[]; total: number; state: string}> {
 if (!backendConfigured()) return {courses: [],total:0,state:"setup"};
 const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {auth:{persistSession:false}});
 const {data,error} = await client.rpc("published_course_catalogue",{p_query:query,p_page:page});
 if(error) { console.error("Catalogue request failed",error.code); return {courses:[],total:0,state:"error"}; }
 return {...data,state:"ready"};
}
export async function courseDetail(id: string): Promise<CourseDetail | null> {
 if (!backendConfigured()) return null;
 const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {auth:{persistSession:false}});
 const {data,error} = await client.rpc("published_course_detail",{p_course:id});
 if(error) throw new Error("Course details are temporarily unavailable.");
 return data;
}

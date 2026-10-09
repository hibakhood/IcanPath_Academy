export const dynamic = "force-dynamic";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { catalogue } from "../../lib/catalogue";
import { CourseCard } from "../../components/course-card";
export const metadata = {title:"Courses"};
export default async function Courses({searchParams}: {searchParams: Promise<{q?:string;page?:string}>}) {
 const params=await searchParams; const q=(params.q || "").slice(0,200); const page=Math.min(10000,Math.max(1,Number.parseInt(params.page || "1",10)||1));
 const result=await catalogue(q,page);
 return <section className="section"><p className="eyebrow">Learn at your next level</p><h1>Explore courses</h1><form className="search" action="/courses"><label htmlFor="q">Search courses</label><input id="q" name="q" defaultValue={q} maxLength={200} placeholder="Title or topic"/><Button type="submit">Search</Button></form>{result.courses.length ? <div className="grid">{result.courses.map(course=><CourseCard key={course.id} course={course}/>)}</div>:<div className="empty"><h2>{result.state === "error" ? "Unable to load courses" : "No courses available yet"}</h2><p>{result.state === "setup" ? "Courses cannot be loaded until the app has a database connection." : "Try another search or check back later."}</p></div>}<nav className="pagination" aria-label="Course pages">{page>1 && <Link href={`/courses?q=${encodeURIComponent(q)}&page=${page-1}`}>Previous</Link>}{page*12<result.total && <Link href={`/courses?q=${encodeURIComponent(q)}&page=${page+1}`}>Next</Link>}</nav></section>;
}

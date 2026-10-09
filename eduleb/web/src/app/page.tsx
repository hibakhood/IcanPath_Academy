export const dynamic = "force-dynamic";
import Link from "next/link";
import { Button } from "../components/ui/button";
import { ArrowRight, BookOpen, Video, Library } from "lucide-react";
import { catalogue } from "../lib/catalogue";
import { CourseCard } from "../components/course-card";
export default async function Home() {
 const result = await catalogue();
 return <><section className="hero"><div><p className="eyebrow">Prepare for your next ICAN exam</p><h1>Learn. Prepare.<br/><em>Achieve.</em></h1><p className="lead">Watch lessons, find study materials and practise for your ICAN exams in one place.</p><Button asChild><Link href="/courses">Explore courses <ArrowRight size={18} aria-hidden="true"/></Link></Button></div><aside className="study-panel"><p className="eyebrow">Study at your own pace</p><h2>Study for<br/>your next exam.</h2><ul><li><BookOpen aria-hidden="true"/>Lessons by course</li><li><Video aria-hidden="true"/>Recorded and live learning</li><li><Library aria-hidden="true"/>Materials to support your study</li></ul></aside></section><section className="section"><p className="eyebrow">Find a course</p><h2>Published courses</h2>{result.courses.length ? <div className="grid">{result.courses.slice(0,3).map(course=><CourseCard key={course.id} course={course}/>)}</div>:<div className="empty"><BookOpen aria-hidden="true"/><h3>{result.state === "error" ? "Courses are temporarily unavailable" : "Courses will appear here"}</h3><p>{result.state === "setup" ? "Courses cannot be loaded until the app has a database connection." : result.state === "error" ? "Please try again shortly." : "Courses appear here when tutors publish them."}</p></div>}</section></>;
}

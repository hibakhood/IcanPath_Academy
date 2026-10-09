export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { z } from "zod";
import { courseDetail } from "../../../lib/catalogue";
export const metadata={title:"Course overview"};
export default async function Course({params}: {params: Promise<{courseId:string}>}) {
 const {courseId}=await params; if(!z.uuid().safeParse(courseId).success) notFound();
 const course=await courseDetail(courseId); if(!course) notFound();
 return <section className="section narrow"><p className="eyebrow">{course.level || "Course overview"}</p><h1>{course.title}</h1><p className="lead">{course.description}</p><p>Instructor: {course.tutor_name || "To be announced"}</p><h2>Curriculum</h2>{course.modules.length ? course.modules.map(module=><article className="card" key={module.id}><h3>{module.title}</h3><ul>{module.lessons.map(lesson=><li key={lesson.id}>{lesson.title}</li>)}</ul></article>):<div className="empty">Course topics and lessons will appear once they are published.</div>}<p className="notice">Sign in to your student dashboard to enrol and access your courses.</p></section>;
}

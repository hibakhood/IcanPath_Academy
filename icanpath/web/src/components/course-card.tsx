import Link from "next/link";
import { BookOpen, ArrowUpRight } from "lucide-react";
import type { Course } from "../lib/catalogue";
export function CourseCard({course}: {course: Course}) {
 return <article className="card"><BookOpen aria-hidden="true" size={26}/><p className="eyebrow">{course.level || "Professional learning"}</p><h2><Link href={`/courses/${course.id}`}>{course.title}</Link></h2><p>{course.description || "See the course topics and available lessons."}</p><footer>{course.tutor_name || "Course instructor"}<ArrowUpRight aria-hidden="true" size={20}/></footer></article>;
}

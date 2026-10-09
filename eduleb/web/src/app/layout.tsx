import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { brand } from "../lib/config";
import "./globals.css";
export const metadata: Metadata = {title: {default:brand.title,template:"%s | ICANPATH Academy"},description:"Explore courses and prepare for your next stage of professional learning."};
export default function Layout({children}: {children: React.ReactNode}) {
 return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header className="site-header"><Link className="brand" href="/"><GraduationCap aria-hidden="true"/><span>{brand.name}<small>Online Learning</small></span></Link><nav aria-label="Main navigation"><Link href="/courses">Explore courses</Link></nav></header><main id="main">{children}</main><footer className="site-footer"><strong>{brand.title}</strong><p>{brand.tagline}</p></footer></body></html>;
}

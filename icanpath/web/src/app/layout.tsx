import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "../lib/config";
import "./globals.css";
export const metadata: Metadata = {title: {default:brand.title,template:"%s | ICANPATH Academy"},icons:{icon:"/assets/img/brand/icanpath-favicon-extracted.png",apple:"/assets/img/brand/icanpath-favicon-extracted.png"},description:"Explore courses and prepare for your next stage of professional learning."};
export default function Layout({children}: {children: React.ReactNode}) {
 return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header className="site-header"><Link className="brand" href="/"><img src="/assets/img/brand/icanpath-logo-extracted.png" alt="" width={44} height={44}/><span>{brand.name}<small>Online Learning</small></span></Link><nav aria-label="Main navigation"><Link href="/courses">Explore courses</Link></nav></header><main id="main">{children}</main><footer className="site-footer"><img src="/assets/img/brand/icanpath-favicon-extracted.png" alt="" width={44} height={44}/><strong>{brand.title}</strong><p>{brand.tagline}</p></footer></body></html>;
}

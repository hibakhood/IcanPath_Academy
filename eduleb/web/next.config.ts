import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
 outputFileTracingRoot:path.resolve(process.cwd()),poweredByHeader:false,
 async headers() {
  const supabase=process.env.NEXT_PUBLIC_SUPABASE_URL;
  let api=""; let socket="";
  if(supabase) { const origin=new URL(supabase); if(origin.protocol!=="https:") throw new Error("Supabase must use HTTPS"); api=origin.origin; socket=api.replace("https:","wss:"); }
  const policy=["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
   "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
   `img-src 'self' data: blob: https://i.ytimg.com ${api}`, "media-src 'self' blob:",
   `connect-src 'self' ${api} ${socket}`, "frame-src https://www.youtube.com https://www.youtube-nocookie.com"].join("; ");
  const headers=[{key:process.env.CSP_MODE==="enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",value:policy},
   {key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},
   {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
   {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"}];
  if(process.env.NODE_ENV==="production" && process.env.PRODUCTION_SITE_URL?.startsWith("https://")) headers.push({key:"Strict-Transport-Security",value:"max-age=31536000"});
  return [{source:"/:path*",headers}];
 },
 async rewrites() {
  const roles=["student","tutor","admin"].map(role=>({source:`/${role}/:page([a-z-]+)`,destination:`/${role}/:page/index.html`}));
  const auth=["login","register","forgot-password","reset-password","pending","suspended","mfa"].map(page=>({source:`/${page}`,destination:`/${page}/index.html`}));
  return {beforeFiles:[{source:"/",destination:"/index.html"},...roles,...auth],afterFiles:[],fallback:[]};
 }
};
export default config;

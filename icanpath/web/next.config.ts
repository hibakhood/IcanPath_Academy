import type { NextConfig } from "next";
import path from "node:path";
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {securityPolicy,cspHeaderName} from "./src/lib/security-policy";
const config: NextConfig = {
 outputFileTracingRoot:path.resolve(process.cwd()),poweredByHeader:false,
 async headers() {
  const siteRoot=path.resolve(process.cwd(),"..");
  const hashes=readdirSync(siteRoot).filter(file=>file.endsWith(".html")).flatMap(file=>
   [...readFileSync(path.join(siteRoot,file),"utf8").matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match=>"'sha256-"+createHash("sha256").update(match[1]).digest("base64")+"'"));
  const policy=securityPolicy({hashes});
  const headers=[{key:cspHeaderName(),value:policy},
   {key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},
   {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
   {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
   {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
   {key:"Cross-Origin-Resource-Policy",value:"same-origin"}];
  if(process.env.NODE_ENV==="production" && process.env.PRODUCTION_SITE_URL?.startsWith("https://")) headers.push({key:"Strict-Transport-Security",value:"max-age=31536000"});
  // Authentication forms may be embedded only by this site's popup.
  const authHeaders=headers.map(header=>header.key==="X-Frame-Options"
   ? {...header,value:"SAMEORIGIN"}
   : header.key.startsWith("Content-Security-Policy")
    ? {...header,value:header.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'")}
    : header);
  return [{source:"/:path*",headers},
   {source:"/:auth(login|register|forgot-password|reset-password)",headers:authHeaders},
   {source:"/:auth(login|register|forgot-password|reset-password)/index.html",headers:authHeaders},
   // The web app manifest must arrive with its registered MIME type for
   // install prompts and for Lighthouse audits; Node's static serving maps
   // .webmanifest by default, this pins it explicitly.
   {source:"/manifest.webmanifest",headers:[{key:"Content-Type",value:"application/manifest+json; charset=utf-8"},{key:"Cache-Control",value:"public, max-age=3600"}]}];
 },
 async rewrites() {
  const roles=["student","tutor","admin"].map(role=>({source:`/${role}/:page([a-z-]+)`,destination:`/${role}/:page/index.html`}));
  const auth=["login","register","forgot-password","reset-password","pending","suspended"].map(page=>({source:`/${page}`,destination:`/${page}/index.html`}));
  return {beforeFiles:[{source:"/",destination:"/index.html"},...roles,...auth],afterFiles:[],fallback:[]};
 }
};
export default config;

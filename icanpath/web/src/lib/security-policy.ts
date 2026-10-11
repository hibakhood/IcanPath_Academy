/** Script restrictions are enforced; inline CSS remains for existing UI styles. */
export function securityPolicy({nonce, hashes = []}: {nonce?:string; hashes?:string[]} = {}) {
 const configured=process.env.NEXT_PUBLIC_SUPABASE_URL;
 let api="",socket="";
 if(configured){const origin=new URL(configured);if(origin.protocol!=="https:")throw new Error("Supabase must use HTTPS");api=origin.origin;socket=api.replace("https:","wss:");}
 return ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  `script-src 'self' ${nonce ? "'nonce-"+nonce+"'" : hashes.join(" ")}${process.env.NODE_ENV==="development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://i.ytimg.com ${api}`, "media-src 'self' blob:",
  `connect-src 'self' ${api} ${socket}`, "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com"].join("; ");
}
export function cspHeaderName(){return process.env.CSP_MODE==="report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";}

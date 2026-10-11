import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { securityPolicy, cspHeaderName } from './lib/security-policy';
export async function proxy(request: NextRequest) {
 const native=request.nextUrl.pathname.startsWith('/courses');
 const nonce=native ? Buffer.from(crypto.randomUUID()).toString('base64') : undefined;
 const policy=native ? securityPolicy({nonce}) : undefined;
 const requestHeaders=new Headers(request.headers);
 if(nonce && policy){requestHeaders.set('x-nonce',nonce);requestHeaders.set('Content-Security-Policy',policy);}
 let response=NextResponse.next({request:{headers:requestHeaders}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(url && key){
  const client=createServerClient(url,key,{cookies:{
   getAll:()=>request.cookies.getAll(),
   setAll:(values)=>{values.forEach(({name,value})=>request.cookies.set(name,value));requestHeaders.set('cookie',request.cookies.toString());response=NextResponse.next({request:{headers:requestHeaders}});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}
  }});
  await client.auth.getUser();
 }
 if(policy) response.headers.set(cspHeaderName(),policy);
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/courses/:path*','/login/:path*','/register/:path*','/forgot-password/:path*','/reset-password/:path*','/mfa/:path*']};

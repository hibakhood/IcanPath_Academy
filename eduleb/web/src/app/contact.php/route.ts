import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
const enquiry=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().max(254).pipe(z.email()),phone:z.string().max(40),subject:z.string().trim().min(1).max(200),message:z.string().trim().min(10).max(5000)});
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin) return Response.json({ok:false,message:'This request could not be accepted.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>20000) return Response.json({ok:false,message:"Your message is too long."},{status:413});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const sourceHeader=process.env.CONTACT_TRUSTED_IP_HEADER,hashKey=process.env.CONTACT_IP_HASH_SECRET;
 const rawSource=sourceHeader ? request.headers.get(sourceHeader)?.trim() : undefined;
 // Only a single IP supplied by a configured, trusted proxy is accepted.
 // Never infer trust from an arbitrary X-Forwarded-For header.
 const source=rawSource && isIP(rawSource) ? rawSource : undefined;
 if(!url||!key||!source||!hashKey||hashKey.length<32) return Response.json({ok:false,message:"We cannot receive messages through this form right now. Please use the contact details on this page."},{status:503});
 try {
  const reader=request.body?.getReader();
  if(!reader) return Response.json({ok:false,message:"Please send a message using the contact form."},{status:400});
  const chunks: Uint8Array<ArrayBuffer>[]=[]; let size=0;
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>20000){await reader.cancel();return Response.json({ok:false,message:"Your message is too long."},{status:413});}chunks.push(new Uint8Array(part.value));}
  const body=new Blob(chunks);
  const form=await new Response(body,{headers:request.headers}).formData();
  if(form.get('company_website')) return Response.json({ok:true,message:"Thank you for your message."});
  const parsed=enquiry.safeParse({name:form.get('name'),email:form.get('email'),phone:form.get('phone')||'',subject:form.get('subject')||'Course enquiry',message:form.get('message')});
  if(!parsed.success) return Response.json({ok:false,message:"Check your name and email address. Your message must have at least 10 characters."},{status:422});
  const data=parsed.data;
  const client=createClient(url,key,{auth:{persistSession:false}});
  const {error}=await client.rpc('submit_trusted_contact',{p_source:createHmac('sha256',hashKey!).update(source!).digest('hex'),p_name:data.name,p_email:data.email,p_phone:data.phone,p_subject:data.subject,p_message:data.message});
  if(error){console.error('Enquiry could not be stored',error.code);return Response.json({ok:false,message:"We could not receive your message. Please try again later."},{status:error.code==='P0001' ? 429 : 422});}
  return Response.json({ok:true,message:"We have received your message. Our team will review it."});
 } catch {return Response.json({ok:false,message:"Please check your message and try again."},{status:400});}
}

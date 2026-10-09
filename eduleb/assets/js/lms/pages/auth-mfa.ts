import { getSession, destinationFor, signOut } from "../auth.ts";
import { supabase } from "../supabase.ts";
import { config } from "../config.ts";
import { renderPage } from "../page.ts";
import { el, input, field, setChildren } from "../ui.ts";

renderPage({title:"Secure your account",page:"mfa"});
const root=document.getElementById("app")!;
const session=await getSession();
if(!session) window.location.replace("/login/");
else if(session.profile.role!=="admin" || session.profile.status!=="active" || config.preview) window.location.replace(destinationFor(session.profile));
else {
 const status=el("p",{role:"status"});
 const card=el("div",{class:"auth-card card"},el("div",{class:"card__body"},el("h1",{},"Secure your administrator account"),el("p",{},"Use an authenticator app to verify your identity before opening administrator tools."),status));
 setChildren(root,el("div",{class:"auth-wrap"},card));
 try {
  const level=await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if(level.error) throw level.error;
  if(level.data?.currentLevel==="aal2") window.location.replace("/admin/dashboard/");
  else {
   const factors=await supabase().auth.mfa.listFactors();
   if(factors.error) throw factors.error;
   const factor=factors.data?.totp.find(f=>f.status==="verified");
   let factorId=factor?.id;
   if(!factorId) {
    // Remove only this user's unfinished enrollments, never verified factors.
    for(const pending of factors.data?.all.filter(f=>f.factor_type==="totp" && f.status!=="verified") ?? []) {
     const removed=await supabase().auth.mfa.unenroll({factorId:pending.id}); if(removed.error) throw removed.error;
    }
    const enrollment=await supabase().auth.mfa.enroll({factorType:"totp",friendlyName:"ICANPATH administrator"});
    if(enrollment.error) throw enrollment.error;
    factorId=enrollment.data.id;
    card.firstElementChild?.append(el("p",{},"Scan this code in your authenticator app. Keep your phone secure."),el("img",{src:enrollment.data.totp.qr_code,alt:"Authenticator enrollment code",width:200,height:200}));
   }
   const code=input({type:"text",required:true,inputmode:"numeric",autocomplete:"one-time-code",pattern:"[0-9]{6}",maxlength:6});
   const submit=el("button",{type:"submit",class:"btn btn--primary"},"Verify and continue");
   const form=el("form",{},field("Six digit code",code),submit);
   form.addEventListener("submit",async event=>{
    event.preventDefault(); if(submit.disabled || !form.reportValidity())return;
    submit.disabled=true;
    try {
     const verified=await supabase().auth.mfa.challengeAndVerify({factorId:factorId!,code:code.value});
     if(verified.error) throw verified.error;
     const assurance=await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
     if(assurance.error || assurance.data?.currentLevel!=="aal2") throw new Error("Verification failed");
     window.location.replace("/admin/dashboard/");
    } catch {status.textContent="The code could not be verified. Try the current code in your authenticator app.";code.value="";}
    finally {submit.disabled=false;}
   });
   card.firstElementChild?.append(form,el("p",{},"Lost your authenticator? Contact your trusted platform operator. Administrator access cannot be restored from this page."));
  }
 } catch {status.textContent="We could not prepare verification. Please sign out and try again.";}
 card.firstElementChild?.append(el("button",{type:"button",class:"btn",onclick:async()=>{try{await signOut();window.location.replace("/login/");}catch{/* signOut redirects on a remote error */}}},"Sign out"));
}

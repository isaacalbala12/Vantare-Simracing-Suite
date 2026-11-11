import {type FormEvent,useEffect,useRef,useState} from "react";
import {accountLimits,accountOptions,type EmailIntent,type EmailView} from "../../../contract/generated/account";
import {useAccount} from "../../app/AccountState";
import {accessText as text} from "../../i18n/access.es";
import {Button} from "../../ui/Button";
import {Callout} from "../../ui/Data";
import {Input} from "../../ui/Forms";
import {OtpField} from "../../ui/OtpField";
export function EmailForm({value}:{value:EmailView}){
 const {pending,act}=useAccount();const root=useRef<HTMLFormElement>(null);const focused=useRef("");
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [code,setCode]=useState("");const [signOutOthers,setSignOutOthers]=useState(false);
 const passwordMode=value.mode==="signInPassword"||value.mode==="signUpPassword";
 const cooling=value.stage==="form"&&value.retryAfterSeconds>0;
 const canSubmit=value.stage!=="authorizing"&&value.stage!=="hostedRequired";
 const label=pending?text.submit.waiting:value.stage==="code"?text.submit.verify:value.stage==="newPassword"?text.submit.password:value.stage==="consent"?text.submit.authorize:value.restarted&&!passwordMode?text.submit.newCode:value.mode==="signInPassword"?text.submit.enter:text.submit.continue;
 useEffect(()=>{setPassword("");setCode("");},[value.stage,value.mode,value.restarted]);
 useEffect(()=>{
  const key=`${value.mode}:${value.stage}`;
  if(!pending&&key!==focused.current){focused.current=key;root.current?.querySelector<HTMLElement>("[data-access-initial]")?.focus();}
 },[value.mode,value.stage,pending]);
 function submit(event:FormEvent){
  event.preventDefault();if(pending||cooling)return;
  let action:EmailIntent;
  switch(value.stage){
   case "form":action={action:"begin",mode:value.mode,email,password};break;
   case "code":action={action:"verify",code};break;
   case "newPassword":action={action:"reset",password,signOutOthers};break;
   case "consent":action={action:"finish"};break;
   default:return;
  }
  setPassword("");setCode("");void act({method:"account.email",action});
 }
 return <form ref={root} className="v-access-form" onSubmit={submit}>
  <h2>{text.titles[value.mode]}</h2>
  {value.stage==="form"&&<>
   <Input label={text.emailLabel} aria-label={text.emailLabel} placeholder={text.emailLabel} data-access-initial="" type="email" autoComplete="email" spellCheck={false} required maxLength={accountLimits.email} value={email} onChange={event=>setEmail(event.currentTarget.value)} disabled={pending}/>
   {passwordMode&&<Input label={text.password} aria-label={text.password} placeholder={text.password} type="password" autoComplete={value.mode==="signInPassword"?"current-password":"new-password"} spellCheck={false} required maxLength={accountLimits.password} value={password} onChange={event=>setPassword(event.currentTarget.value)} onCopy={event=>event.preventDefault()} onCut={event=>event.preventDefault()} disabled={pending}/>}
  </>}
  {value.stage==="code"&&<>
   <OtpField label={text.code} value={code} onChange={setCode} disabled={pending}/>
   <Button type="button" disabled={pending||value.retryAfterSeconds>0} onClick={()=>void act({method:"account.email",action:{action:"resend"}})}>{text.resend}</Button>
  </>}
  {value.stage==="newPassword"&&<>
   <Input label={text.newPassword} aria-label={text.newPassword} placeholder={text.newPassword} data-access-initial="" type="password" autoComplete="new-password" spellCheck={false} required maxLength={accountLimits.password} value={password} onChange={event=>setPassword(event.currentTarget.value)} onCopy={event=>event.preventDefault()} onCut={event=>event.preventDefault()} disabled={pending}/>
   <Button type="button" variant="ghost" aria-pressed={signOutOthers} disabled={pending} onClick={()=>setSignOutOthers(current=>!current)}>{signOutOthers?"✓ ":""}{text.signOutOthers}</Button>
  </>}
  {value.stage==="consent"&&<p className="v-access-consent">{text.consent}</p>}
  {value.stage==="authorizing"&&<p className="v-access-authorizing">{text.authorizing}</p>}
  {value.message&&<Callout title={value.message}/>}
  {value.stage==="hostedRequired"&&<Button data-access-initial="" type="button" className="v-access-choice" disabled={pending} onClick={()=>void act({method:"account.begin"})}>{text.hosted}</Button>}
  {canSubmit&&<Button type="submit" data-access-initial={value.stage==="consent"?"":undefined} variant="primary" className="v-access-submit" disabled={pending||cooling} aria-describedby={pending?"access-waiting":undefined}>{label}</Button>}
  {value.stage==="form"&&<div className="v-access-modes">{accountOptions.modes.filter(mode=>mode!==value.mode).map(mode=><Button key={mode} type="button" className="v-access-mode" disabled={pending} onClick={()=>void act({method:"account.email",action:{action:"open",mode}})}>{text.modes[mode]}</Button>)}</div>}
  <Button type="button" className="v-access-back" onClick={()=>void act({method:"account.email",action:{action:"cancel"}})}>{text.back}</Button>
  {pending&&<span id="access-waiting" className="v-sr-only">{text.waiting}</span>}
 </form>;
}

// Characterization written before the 5b changes; only provider/SQL doubles.
import { type AdminDeps, handleNativeAdmin } from "./index.ts";
import { account, assert, authDeps, request, subject } from "../native-account-authorize/testdata/auth.ts";

const target = "00000000-0000-4000-8000-000000001995";
function fixture(status = 200, blocked = false, sqlFailure = false) {
  const calls: string[] = [];
  const outcomes: string[] = [];
  const deps = {
    ...authDeps(), adminAuth: {enabled: false, clientId: ""}, environment: "sandbox" as const,
    gate: () => Promise.resolve(true), resolve: () => Promise.resolve(account), begin: () => Promise.resolve(true),
    recordEffect: (_actor: string, event: {effect: string; outcome: string}) => {outcomes.push(event.outcome); calls.push(event.effect+":"+event.outcome); return Promise.resolve(true);},
    claimChange: () => Promise.resolve("00000000-0000-4000-8000-000000001996"),
    releaseChange: () => Promise.resolve(true),
    finishChange: () => {calls.push("state"); if(sqlFailure) return Promise.reject({message: "native_admin_owner_conflict"}); return Promise.resolve({});},
    execute: (_a: string,_i: string,action: string) => {
      if(action === "get_account") return Promise.resolve({account: {account_id:target, owner:false, clerk_subject:subject, subscriptions:[]}});
      if(action === "set_blocked") {calls.push("state"); if(sqlFailure) return Promise.reject({message:"native_admin_owner_conflict"});}
      return Promise.resolve({});
    },
    fetch: (url: Parameters<typeof fetch>[0],init?: RequestInit) => {
      if(String(url).endsWith(blocked ? "/ban" : "/unban")) {calls.push("provider"); return Promise.resolve(new Response(null,{status}));}
      return authDeps().fetch!(url,init);
    },
  };
  const call=() => handleNativeAdmin(request({version:1,action:"set_blocked",account_id:target,blocked}),deps);
  return {deps,call,calls,outcomes};
}
for (const status of [401,403,422]) Deno.test(`5b: definitive Clerk ${status} is failed, not unknown`,async()=>{
  const f=fixture(status); assert((await f.call()).status===503);
  assert(JSON.stringify(f.outcomes)===JSON.stringify(["started","failed"]));
});
Deno.test("5b: SQL 409 after unban is incomplete, not a safe conflict",async()=>{
  const f=fixture(200,false,true); const response=await f.call();
  assert(response.status===503 && (await response.json()).error==="account_change_incomplete");
});
Deno.test("5b: occupied account lease prevents even the ban SQL state and provider call",async()=>{
  const f=fixture(200,true); const deps={...f.deps,claimChange:()=>Promise.resolve(null)};
  const response=await handleNativeAdmin(request({version:1,action:"set_blocked",account_id:target,blocked:true}),deps);
  assert(response.status===409 && f.calls.length===0);
});
Deno.test("5b: ban state precedes intent/provider and closes the journal",async()=>{
  const f=fixture(200,true); assert((await f.call()).status===200);
  assert(JSON.stringify(f.calls)===JSON.stringify(["state","clerk_ban:started","provider","clerk_ban:succeeded"]));
});

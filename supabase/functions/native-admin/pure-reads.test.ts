import { handleNativeAdmin, type AdminDeps } from "./index.ts";
import { account, assert, authDeps, request } from "../native-account-authorize/testdata/auth.ts";
const calls: string[] = [];
function deps(): AdminDeps {
 return {...authDeps(), environment:"sandbox",gate:()=>Promise.resolve(true),resolve:()=>Promise.resolve(account),begin:()=>Promise.resolve(true),
  execute:(_actor,_issuer,action)=>{calls.push(action);return Promise.resolve(action==="get_payment_sync"?{needs_sync:true}:action==="get_account"?{account:{account_id:account}}:action==="list_creators"?{creators:[]}:{creator:{creator_id:account}});},
  polar:{fetchFn:()=>{throw new Error("pure reads must not call Polar");}}};
}
for(const [action,params] of [["get_account",{account_id:account}],["list_creators",{}],["get_creator",{creator_id:account}]] as const) {
 Deno.test("pending history remains a pure read: "+action,async()=>{
  calls.length=0; const response=await handleNativeAdmin(request({version:1,action,...params}),deps());
  assert(response.status===200); const body=await response.json();assert(body.payment_sync_required===true);
  assert(!calls.some(x=>x.startsWith("sync_admin_")||x==="finish_payment_sync"));
 });
}
Deno.test("explicit payment sync checks its own quota before any provider call",async()=>{
 const testDeps= {...deps(),paymentSyncBudget:()=>Promise.resolve(false)};
 const response=await handleNativeAdmin(request({version:1,action:"sync_payments"}),testDeps);
 assert(response.status===429);
});

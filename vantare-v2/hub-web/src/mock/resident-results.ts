import type { HostToUi, ResidentOrderRejection, ResidentRunResults, ResidentView } from "../contract/generated/contract";
import type { MockContext, MockHandler } from "./context";

export function createResidentResultsMock(context: MockContext, view: ResidentView, schedule: (callback:()=>void, delay:number)=>unknown): MockHandler {
  const scene=context.sceneName;
  if (!scene.startsWith("launcher-results-")) return ()=>undefined;
  const doc=context.launcherData;
  if (!doc?.profiles[0]) throw new Error("QA results require a local profile");
  context.core.services="connected";
  context.core.accountGeneration="a".repeat(64);
  context.core.access.verified=true;
  let serial=1;
  let queued=false;
  // Resident-owned lineage; All must not be reconstructed from the latest NotSelected states.
  const original=new Set([1,2]);
  let failed=new Set([1]);
  let summary:ResidentRunResults & {retryFailed:boolean}={run:"1",profile:doc.profiles[0].id,revision:doc.revision,accountGeneration:"a".repeat(64),mode:"rehearsal",outcome:{kind:"failed",reason:"step-failed"},retryFailed:true,steps:[{index:0,state:"not-selected"},{index:1,state:"failed"},{index:2,state:"ready"}]};
  view.execution={instance:"b".repeat(64),revisionCheckedLaunch:true,checkedAnswer:true,checkedControl:true,active:null,question:null,results:scene.endsWith("unsupported") ? {kind:"unsupported"} : scene.endsWith("unknown") ? {kind:"unknown"} : {kind:"known",value:summary},firstRetainedSeq:"1",events:[{seq:"1",kind:{kind:"finished",run:"1",outcome:{kind:"failed",reason:"step-failed"}}}]};
  const execution=view.execution;
  if(scene.endsWith("stale")) summary.revision="c".repeat(64)===doc.revision ? "e".repeat(64) : "c".repeat(64);
  const sequence=()=>String(BigInt(execution.events.at(-1)?.seq ?? "0")+1n);
  const publish=()=>{
    context.emit?.({kind:"event",event:{topic:"launcher",value:structuredClone(doc)}});
    context.emit?.({kind:"event",event:{topic:"launcherResident",value:structuredClone(view)}});
  };
  return message=>{
    if(message.kind!=="request" || message.request.method!=="launcher.resident.retry") return undefined;
    const target=message.request.target;
    const failure=(reason:ResidentOrderRejection):HostToUi=>({kind:"failure",id:message.id,error:{kind:"residentControlRejected",reason}});
    function invalid():ResidentOrderRejection | undefined {
      if(context.core.services!=="connected" || !view.online) return "unavailable";
      if(!context.core.access.verified || context.core.access.blocked || context.core.live) return "denied";
      if(target.instance!==execution.instance) return "wrong-instance";
      if(target.accountGeneration!==context.core.accountGeneration) return "account-changed";
      if(execution.results.kind!=="known" || target.run!==summary.run || target.profile!==summary.profile) return "unknown-run";
      if(target.revision!==doc.revision || target.revision!==summary.revision || doc.protected) return "revision-mismatch";
      if(target.scope==="failed" && !summary.retryFailed) return "no-failed-steps";
    }
    if(queued || view.running) return failure("busy");
    if(execution.results.kind==="unsupported") return {kind:"failure",id:message.id,error:{kind:"unsupported"}};
    const reason=invalid();if(reason) return failure(reason);
    queued=true;
    const request=String(++serial).padStart(32,"0");
    const run=String(serial);
    schedule(()=>{
      queued=false;
      if(scene.endsWith("timeout")) return;
      if(scene.endsWith("restart")) {
        execution.instance="e".repeat(64);execution.results={kind:"unknown"};execution.events=[];publish();return;
      }
      if(scene.endsWith("gap")) {
        execution.firstRetainedSeq="3";execution.events=[{seq:"3",kind:{kind:"started",run}}];
        execution.results={kind:"unknown"};view.running=true;doc.running=true;publish();return;
      }
      const rejected=invalid() ?? (scene.endsWith("rejected") ? "start-failed" : undefined);
      execution.events.push({seq:sequence(),kind:{kind:"order-received",request,receipt:rejected ? {kind:"rejected",reason:rejected} : {kind:"accepted",run}}});
      if(rejected){publish();return;}
      const selected=target.scope==="all" ? original : failed;
      summary={...summary,run,outcome:null,steps:summary.steps.map(step=>({index:step.index,state:selected.has(step.index)?"pending":"not-selected"}))};
      execution.results={kind:"known",value:summary};
      execution.active={run,revision:summary.revision,accountGeneration:summary.accountGeneration};view.running=true;doc.running=true;publish();
      if(scene.endsWith("accepted")) return;
      schedule(()=>{
        summary.outcome={kind:"completed"};summary.retryFailed=false;failed=new Set();
        summary.steps=summary.steps.map(step=>({...step,state:selected.has(step.index)?"ready":"not-selected"}));
        execution.events.push({seq:sequence(),kind:{kind:"finished",run,outcome:summary.outcome}});
        execution.active=null;view.running=false;doc.running=false;publish();
      },1000);
    },0);
    return {kind:"response",id:message.id,result:{method:"launcher.resident.retry",value:{kind:"queued",request}}};
  };
}

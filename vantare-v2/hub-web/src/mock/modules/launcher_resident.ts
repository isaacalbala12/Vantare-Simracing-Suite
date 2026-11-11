import type { ResidentView, HostToUi } from "../../contract/generated/contract";
import { residentActionLabels } from "../../contract/generated/launcher_resident";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const offline = context.sceneName === "launcher-offline";
  const view: ResidentView = {protected:false,online:!offline,running:false,error:false,decision:null,registrations:[]};
  if (context.sceneName === "launcher-decision") {
    view.running = true;
    view.decision = {id:"18446744073709551615",kind:"authorization",actions:[{id:"trust",label:residentActionLabels.trust},{id:"cancel",label:residentActionLabels.cancel}]};
  }
  if (context.sceneName === "launcher-shortcuts") view.registrations = [
    {id:"creator",name:"Creator",hotkey:"ctrl+shift+1",state:"registered"},
    {id:"pro",name:"Pro",hotkey:"ctrl+shift+2",state:"error"},
  ];
  const event = (): HostToUi => ({kind:"event",event:{topic:"launcherResident",value:structuredClone(view)}});
  return message => {
    if (message.kind === "subscribe" && message.topic === "launcherResident") return event();
    if (message.kind !== "request" || message.request.method !== "launcher.resident.get") return undefined;
    return {kind:"response",id:message.id,result:{method:"launcher.resident.get",value:structuredClone(view)}};
  };
}

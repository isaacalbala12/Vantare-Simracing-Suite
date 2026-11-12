import { calendarLaunchLeadMs, type CalendarLaunchView } from "../../contract/generated/calendar";
import { calendarLaunchStops,calendarLaunchText as text,calendarLaunchUnknowns } from "../i18n/calendarLaunch";
import { Button } from "./Button";
import { Callout } from "./Data";
import { clock } from "./calendarDate";
export function CalendarLaunchStatus({value,busy,utc,onCancel}:{value:CalendarLaunchView|undefined;busy:boolean;utc:boolean;onCancel:(id:string)=>void}) {
  if(!value)return null;
  const latest=value.latest;
  const progress=latest?.progress;
  const summary=progress?.kind==="queued"?text.queued:progress?.kind==="running"?text.running:progress?.kind==="unknown"?`${text.unknown} ${calendarLaunchUnknowns[progress.reason]}`:progress?.kind==="notSent"?calendarLaunchStops[progress.reason]:progress?.kind==="rejected"?text.rejected:progress?.kind==="finished"?progress.outcome.kind==="completed"?text.completed:progress.outcome.kind==="cancelled"?text.cancelled:progress.outcome.reason==="decision-expired"?text.expiredDecision:text.failed:undefined;
  return <>
    {[value.armed,value.automatic].map((plan)=>plan&&<Callout key={plan.armId} title={plan.mode.kind==="once"?text.armed(plan.profileName,clock(plan.mode.startAt-calendarLaunchLeadMs,utc)):text.automatic(plan.profileName)} actions={<Button aria-disabled={busy} onClick={()=>{if(!busy)onCancel(plan.armId);}}>{text.cancel}</Button>}>
      <p>{text.onlyOpen}</p>{plan.decisionRequired&&<p>{text.ask}</p>}
    </Callout>)}
    {value.change&&<p role="status">{calendarLaunchStops[value.change.reason]}</p>}
    {summary&&<Callout title={summary} tone={progress?.kind==="unknown"||progress?.kind==="notSent"||progress?.kind==="rejected"?"warn":"info"}>{latest?.profileName}</Callout>}
  </>;
}

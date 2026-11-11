import type { CalendarSchedule, CalendarSeries } from "../../../contract/generated/calendar";
import { calendarText as text } from "./es";
import { civilDay, datePart, weekTitle } from "./date";
import { starts } from "./schedule";
function Identity({series}:{series:CalendarSeries}) {
 const label=text.tiers[series.tier as keyof typeof text.tiers]??series.tier;
 return <div className="v-calendar-series"><strong>{series.name}</strong><span><b data-tier={series.tier}>{label}</b> {series.track.split(" (")[0]} · {text.minutes(series.raceDurationMin??0)}</span></div>;
}
export function WeekBoard({schedule,utc,limit}:{schedule:CalendarSchedule;utc:boolean;limit:number}) {
 const at=Date.parse(schedule.validFrom);const days=Array.from({length:7},(_,i)=>civilDay(at,i,utc));
 const events=schedule.series.filter(s=>s.recurrence.kind!=="interval");
 const daily=schedule.series.filter(s=>s.recurrence.kind==="interval");
 return <section className="v-calendar-week" aria-label={text.lastWeek(weekTitle(at,utc))}>
  <div className="v-calendar-week-title"><h2>{text.lastWeek(weekTitle(at,utc))}</h2><span className="v-calendar-pill">{text.readonly}</span><span>{text.readonlyHelp}</span></div>
  <div className="v-calendar-week-days"><span>{text.series}</span>{days.map(d=><div key={d}><small>{datePart(d,"weekday",utc)}</small><strong>{datePart(d,"day",utc)}</strong></div>)}</div>
  <div className="v-calendar-week-body">
   <div className="v-calendar-group">{text.weekly}<span>{text.fixedSlots}</span></div>
   {events.map(s=><div className="v-calendar-week-row" key={s.id}><Identity series={s}/><div className="v-calendar-week-cells">{days.map((d,i)=>{const end=civilDay(at,i+1,utc);const times=starts(schedule,s,d,end,limit);return <div className="v-calendar-event-cell" key={d}><div className="v-calendar-event-track">{times.map(time=><i key={time} style={{left:`${100*(time-d)/(end-d)}%`}}/>)}</div><small>{text.count(times.length)}</small></div>;})}</div></div>)}
   <div className="v-calendar-group">{text.daily}<span>{text.sameTrack}</span></div>
   {daily.map(s=><div className="v-calendar-week-row" key={s.id}><Identity series={s}/><div className="v-calendar-week-cells"><div className="v-calendar-daily-bar">{text.every(s.recurrence.intervalMinutes)}</div></div></div>)}
  </div>
 </section>;
}

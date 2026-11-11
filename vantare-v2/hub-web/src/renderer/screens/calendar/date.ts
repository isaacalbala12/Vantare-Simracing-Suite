const day=86_400_000;
export function civilDay(at:number,offset:number,utc:boolean) {
 const d=new Date(at);if(utc){d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+offset);}else{d.setHours(0,0,0,0);d.setDate(d.getDate()+offset);}return d.getTime();
}
export function datePart(at:number,part:"day"|"month"|"weekday",utc:boolean) {
 const value=new Intl.DateTimeFormat("es",{[part]:part==="day"?"numeric":"short",...(utc?{timeZone:"UTC"}:{})}).format(at);return value.replace(/\.$/u,"");
}
export function weekTitle(at:number,utc:boolean) {
 const last=civilDay(at,6,utc);return `${datePart(at,"day",utc)}–${datePart(last,"day",utc)} ${datePart(last,"month",utc)}`;
}
export function clock(at:number,utc:boolean) {return new Intl.DateTimeFormat("es",{hour:"2-digit",minute:"2-digit",hour12:false,...(utc?{timeZone:"UTC"}:{})}).format(at);}
export function elapsedDays(from:number,until:number) {return Math.max(0,Math.floor((until-from)/day));}

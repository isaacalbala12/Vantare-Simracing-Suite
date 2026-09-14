import {readFileSync} from "node:fs";
import {expect, it} from "vitest";
import {createOverlaySectionDecoder, OVERLAY_V2_SNAPSHOT_EVENT as name} from "./overlay-frame-v2-store";

const fixture = () => JSON.parse(readFileSync("../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json", "utf8"));
const wire = (delivery: number, data: unknown, baseRevision?: number, sessionId="s") => JSON.stringify({sessionId,delivery,events:[{name,data,...(baseRevision===undefined?{}:{baseRevision})}]});

it("reconstructs complete immutable frames, preserves empty rows and does not mutate the prior frame", () => {
 const decode=createOverlaySectionDecoder(); const original=fixture(); original.revision=1;
 const first=decode(wire(1,original),{sessionId:"s",ack:0}) as {events:{data:typeof original}[]};
 const changed={revision:2,source:{state:"live"},frame:{sequence:original.frame.sequence+1,standings:[]}};
 const next=decode(wire(2,changed,1),{sessionId:"s",ack:1}) as typeof first;
 expect(next.events[0]!.data).toEqual({...original,...changed,frame:{...original.frame,...changed.frame}});
 expect(next.events[0]!.data.frame.weather).toBe(first.events[0]!.data.frame.weather);
 expect(first.events[0]!.data.frame.standings.length).toBeGreaterThan(0);
 expect(Object.isFrozen(next.events[0]!.data.frame)).toBe(true);
});

it("rejects missing/wrong bases and session/ACK errors without advancing state", () => {
 const decode=createOverlaySectionDecoder(); const value=fixture(); value.revision=1;
 decode(wire(1,value),{sessionId:"s",ack:0});
 const patch={revision:2,source:{state:"live"},frame:{}};
 expect(()=>decode(wire(2,patch,999),{sessionId:"s",ack:1})).toThrow();
 expect(()=>decode(wire(2,patch,1,"other"),{sessionId:"s",ack:1})).toThrow();
 expect(()=>decode(wire(3,patch,1),{sessionId:"s",ack:1})).toThrow();
 expect(()=>decode(wire(2,patch,1),{sessionId:"s",ack:1})).not.toThrow();
 expect(()=>decode(wire(1,{...patch,revision:3},2,"new"),{sessionId:"new",ack:0})).toThrow();
});

it("retains limits for expanded frames and rejects unknown sections atomically", () => {
 const decode=createOverlaySectionDecoder(); const value=fixture(); value.revision=1;
 decode(wire(1,value),{sessionId:"s",ack:0});
 const patch={revision:2,source:{state:"live"},frame:{player:{...value.frame.player,id:"é".repeat(36*1024)}}};
 expect(()=>decode(wire(2,patch,1),{sessionId:"s",ack:1})).toThrow("size");
 expect(()=>decode(wire(2,{...patch,frame:{intruder:1}},1),{sessionId:"s",ack:1})).toThrow();
 expect(()=>decode(wire(2,{...patch,frame:{}},1),{sessionId:"s",ack:1})).not.toThrow();
});

it("always validates replacement rows and commits no partial envelope", () => {
 const decode=createOverlaySectionDecoder(); const value=fixture(); value.revision=1;
 decode(wire(1,value),{sessionId:"s",ack:0});
 const valid={revision:2,source:{state:"live"},frame:{sequence:value.frame.sequence+1}};
 const invalid={revision:2,source:{state:"live"},frame:{standings:[{unexpected:true}]}};
 expect(()=>decode(wire(2,invalid,1),{sessionId:"s",ack:1})).toThrow();
 const mixed=JSON.stringify({sessionId:"s",delivery:2,events:[
  {name,data:valid,baseRevision:1},
  {name:"telemetry:overlay-v2:status",data:{revision:3,source:{state:"invented"},frame:null}},
 ]});
 expect(()=>decode(mixed,{sessionId:"s",ack:1})).toThrow();
 expect(()=>decode(wire(2,valid,1),{sessionId:"s",ack:1})).not.toThrow();
});

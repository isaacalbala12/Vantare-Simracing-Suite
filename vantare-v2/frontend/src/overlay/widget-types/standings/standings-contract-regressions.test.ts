import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OverlayFrameV2 } from "../../../generated/telemetry";
import { buildStandingsViewModelV2 } from "./standings-view-model-v2";
import { standingsDefinition } from "./standings-definition";
import { buildBroadcastTowerViewModelV2 } from "../broadcast-tower/broadcast-tower-view-model-v2";
import { resolveFunctionalFooterSlots } from "../../design-systems/vantare-functional/footer-slots";
import { functionalLabels } from "../../design-systems/vantare-functional/labels";
const content = standingsDefinition.parseContent({classScope:"player-class",rowCount:30});
function frame() {
 const f = JSON.parse(readFileSync("../internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json","utf8")).frame as OverlayFrameV2;
 f.session.phase={q:"fresh",v:"race"};
 f.player.id="gt1";
 f.standings=[
 {...f.standings[0]!,id:"hy1",position:1,classPosition:1,classId:"HYP",gap:{q:"fresh",v:0},gapLaps:0},
 {...f.standings[0]!,id:"gt1",position:11,classPosition:1,classId:"GT3",quality:{q:"fresh"},classRef:11,classGap:0,classGapLaps:0,gap:{q:"fresh",v:80},gapLaps:0},
 {...f.standings[0]!,id:"gt2",position:12,classPosition:2,classId:"GT3",quality:{q:"fresh"},classRef:11,classGap:4,classGapLaps:0,gap:{q:"fresh",v:84},gapLaps:0}];
 return f;
}
const towerContent={rowCount:10,showWeather:true,showSof:true};
describe("Standings canonical data regressions",()=>{
 it("class P2 gap uses class leader reference",()=>{
 const m=buildStandingsViewModelV2(frame(),{state:"live"},content);
 expect(m.rows[1]!.gapText).toBe("+4.00s");
 });
 it("degraded source does not claim ready",()=>{
 expect(buildStandingsViewModelV2(frame(),{state:"degraded"},content).status).toBe("stale");
 });
 it("connecting source does not show old standings as ready",()=>{
 expect(buildStandingsViewModelV2(frame(),{state:"connecting"},content).status).toBe("disconnected");
 });
 it("horizontal lapped car does not show a same-lap seconds gap",()=>{
 const f=frame(); f.standings[2]!.gapLaps=2;
 const m=buildBroadcastTowerViewModelV2(f,{state:"live"},towerContent);
 expect(m.rows[2]!.gapLaps).toBe(2);
 });
 it("live source with stale row gap does not yield unmarked current horizontal gap",()=>{
 const f=frame();f.standings[2]!.gap={q:"stale",v:84};
 expect(buildBroadcastTowerViewModelV2(f,{state:"live"},towerContent).rows[2]!.gap).toBeUndefined();
 });
 it("footer lap resolves available player completed laps",()=>{
 const f=frame();f.standings[1]!.laps=7;
 const m=buildStandingsViewModelV2(f,{state:"live"},content);
 expect(resolveFunctionalFooterSlots(m,["lap"],functionalLabels.en)[0]!.value).not.toBe("—");
 });
 it("last lap carries rounding into minutes",()=>{
 const f=frame();f.standings[1]!.lastLap={q:"fresh",v:119.9999};
 expect(buildStandingsViewModelV2(f,{state:"live"},content).rows[0]!.lastLapText).toBe("2:00.000");
 });
 it("compact last-lap format/decimals are honored",()=>{
 const f=frame();f.standings[1]!.lastLap={q:"fresh",v:92.123};
 const c={...content,columns:content.columns.map(c=>c.metricId==="lastLap"?{...c,format:{display:"compact",decimals:1}}:c)};
 expect(buildStandingsViewModelV2(f,{state:"live"},c).rows[0]!.lastLapText).toBe("32.1");
 });
 it("temperature output honors Fahrenheit preference",()=>{
 const f=frame();f.units.temperature="fahrenheit";f.weather.trackC={q:"fresh",v:20};
 expect(buildStandingsViewModelV2(f,{state:"live"},content).trackTempText).toBe("68°");
 });
});

it("retains fresh zero laps and player footer outside the displayed rows", () => {
 const f=frame(); f.standings[1]!.laps=0;
 const m=buildStandingsViewModelV2(f,{state:"live"},{...content,classScope:"all-classes",rowCount:1});
 expect(m.rows.some(row => row.isPlayer)).toBe(false);
 expect(resolveFunctionalFooterSlots(m,["lap","position"],functionalLabels.en).map(slot => slot.value)).toEqual(["0","11"]);
});
it("does not trust missing legacy quality or stale scalar overrides", () => {
 const f=frame(); f.standings[1]!.quality=undefined;
 let m=buildStandingsViewModelV2(f,{state:"live"},content);
 expect(m.rows[0]).toMatchObject({position:0,pitText:"",currentLapText:"—"});
 f.standings[1]!.quality={q:"fresh",position:"invalid",pit:"invalid",laps:"stale"};
 f.standings[1]!.pit="pit";
 m=buildStandingsViewModelV2(f,{state:"live"},content);
 expect(m.rows[0]).toMatchObject({position:0,pitText:"",currentLapText:"—"});
});
it("uses the explicit class projection and native interval independently", () => {
 const f=frame(); f.standings[2]!.interval=1.25; f.standings[2]!.intervalLaps=0;
 let m=buildStandingsViewModelV2(f,{state:"live"},content);
 expect(m.rows[1]).toMatchObject({gapText:"+4.00s",intervalText:"+1.25s"});
 f.standings[2]!.quality={q:"fresh",classGap:"missing"};
 m=buildStandingsViewModelV2(f,{state:"live"},content);
 expect(m.rows[1]!.gapText).toBe("—");
});
it("production player window selects from the complete field", () => {
 const f=frame(); f.player.id="gt2";
 const m=buildStandingsViewModelV2(f,{state:"live"},{...content,rowCount:1,playerWindow:true,windowAround:0});
 expect(m.rows.some(row => row.isPlayer)).toBe(true);
});


it("stopping clears retained telemetry in both standings models", () => {
 const f=frame();
 expect(buildStandingsViewModelV2(f,{state:"stopping"},content)).toMatchObject({status:"disconnected",rows:[]});
 expect(buildBroadcastTowerViewModelV2(f,{state:"stopping"},towerContent)).toMatchObject({status:"disconnected",rows:[]});
});

it.each(["practice","qualifying"])("%s multiclass pace gaps use each class best before cropping", phase => {
 const f=frame(); f.session.phase={q:"fresh",v:phase};
 f.standings=[
   {...f.standings[0]!,id:"h1",position:1,classPosition:1,classId:"HYP",quality:{q:"fresh"},bestLap:{q:"fresh",v:100}},
   {...f.standings[1]!,id:"g1",position:2,classPosition:1,classId:"GT3",bestLap:{q:"fresh",v:120}},
   {...f.standings[2]!,id:"g2",position:3,classPosition:2,classId:"GT3",bestLap:{q:"fresh",v:122}},
 ];
 const grouped={...content,classScope:"all-classes" as const,classificationMode:"multiclass" as const};
 expect(buildStandingsViewModelV2(f,{state:"live"},grouped).rows.map(row => row.gapText)).toEqual(["Leader","Leader","+2.00s"]);
 expect(buildStandingsViewModelV2(f,{state:"live"},{...grouped,rowCount:2}).rows[1]).toMatchObject({isLeader:true,gapText:"Leader"});
 expect(buildStandingsViewModelV2(f,{state:"live"},{...grouped,classificationMode:"normal"}).rows[1]!.gapText).toBe("+20.00s");
});

it("class intervals never reuse a hidden other-class overall predecessor", () => {
 const f=frame(); f.player.id="h3";
 f.standings=[
   {...f.standings[0]!,id:"h1",position:1,classPosition:1,classId:"HYP",quality:{q:"fresh"}},
   {...f.standings[1]!,id:"g2",position:2,classPosition:1,classId:"GT3",quality:{q:"fresh"}},
   {...f.standings[2]!,id:"h3",position:3,classPosition:2,classId:"HYP",quality:{q:"fresh"},interval:2,intervalLaps:0},
 ];
 const grouped={...content,classScope:"all-classes" as const,classificationMode:"multiclass" as const};
 expect(buildStandingsViewModelV2(f,{state:"live"},content).rows.map(row => row.id)).toEqual(["h1","h3"]);
 expect(buildStandingsViewModelV2(f,{state:"live"},content).rows[1]!.intervalText).toBe("—");
 expect(buildStandingsViewModelV2(f,{state:"live"},grouped).rows[2]!.intervalText).toBe("—");
 expect(buildStandingsViewModelV2(f,{state:"live"},{...grouped,classificationMode:"normal"}).rows[2]!.intervalText).toBe("+2.00s");
 f.standings[1]!.classId="hyp";
 expect(buildStandingsViewModelV2(f,{state:"live"},content).rows[2]!.intervalText).toBe("+2.00s");
 f.standings[1]!.quality={q:"fresh",position:"stale"};
 expect(buildStandingsViewModelV2(f,{state:"live"},content).rows[2]!.intervalText).toBe("—");
});

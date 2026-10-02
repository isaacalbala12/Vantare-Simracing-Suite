import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StandingsFunctional } from "./StandingsFunctional";
import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";
afterEach(cleanup);
const model:StandingsViewModel={type:"standings",status:"ready",sessionLabel:"RACE",activeClass:"GT3",remainingText:"1:00",columns:[],rows:[],trackTempText:"20°",sessionInfo:{track:{text:"Le Mans"},trackTemperature:{text:"20°C"},airTemperature:{text:"—"},estimatedLaps:{text:"—"},totalLaps:{text:"—"},remaining:{text:"—"},rain:{text:"—"},wetness:{text:"—"}}};
it("honors disabled footer with actual temperature data",()=>{
const {container}=render(<StandingsFunctional model={model} settings={{showSessionFooter:false}} renderMode="harness"/>);
expect(container.querySelector('[data-session-footer]')).toBeNull();
});
it("honors selected track footer when temperature arrives",()=>{
const {container}=render(<StandingsFunctional model={model} settings={{showSessionFooter:true,footerFirst:"track",footerSecond:"none"}} renderMode="harness"/>);
expect(container.textContent).toContain("Le Mans");
});

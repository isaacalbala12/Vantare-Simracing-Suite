import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildCarDamageVisualViewModel } from "./car-damage-visual-view-model";
describe("buildCarDamageVisualViewModel",()=>{it("shows missing live until an approved damage contract is present",()=>{const base=buildMockTelemetry({session:"race",location:"track"});expect(buildCarDamageVisualViewModel(base,{showPercent:true,showAero:true}).status).toBe("missing");expect(buildCarDamageVisualViewModel({...base,damage:{body:0.9,aero:0.8,suspension:0.7,tyres:[0.95,0.94,0.93,0.92]}},{showPercent:true,showAero:true})).toMatchObject({status:"ready",body:0.9,aero:0.8});});});

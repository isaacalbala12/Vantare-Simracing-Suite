import { describe, expect, it } from "vitest";
import { buildMockTelemetry } from "../../core/mock-scenarios";
import { buildCarDamageNumbersViewModel } from "./car-damage-numbers-view-model";
describe("buildCarDamageNumbersViewModel",()=>{it("is a distinct numeric model with honest availability",()=>{const base=buildMockTelemetry({session:"race",location:"track"});const model=buildCarDamageNumbersViewModel({...base,damage:{body:0.9,aero:0.8,suspension:0.7,tyres:[0.95,0.94,0.93,0.92]}},{showTyres:true,format:"percent"});expect(model.type).toBe("car-damage-numbers");expect(model.tyres).toEqual([0.95,0.94,0.93,0.92]);});});

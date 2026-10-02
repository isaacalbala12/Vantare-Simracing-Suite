import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { EngineerOrbitPage } from "./EngineerOrbitPage";
import type { EngineerBridge } from "./engineer-orbit-bridge";
import type { EngineerDiagnostics } from "./engineer-orbit-types";
vi.mock("@wailsio/runtime", () => ({ Events: { Emit: vi.fn(), On: () => () => undefined } }));
const snapshot: EngineerDiagnostics = {
 subtitlesPreference:true,visualPresentationEnabled:true,version:1,capturedAt:1000,running:true,playerAvailable:true,cacheOnly:true,locale:"es",spotterVoice:"ef_dora",engineerVoice:"ef_dora",audioTestActive:false,historyLimit:200,radioHistoryAvailable:true,
 status:{enabled:false,connected:false,source:"telemetry-core",presentationLifecycle:2,spotterEnabled:true,spotterAvailability:{state:"waiting"},sensitivity:"normal",ttsCacheCount:0,recentMessages:[],outputModes:{fuel:"both",spotter:"both"},subtitlesEnabled:true,lastError:"runtime_error"},
 health:{ok:false,dropCount:0,activeFamilies:0,policy:{pending:0,accepted:0,emitted:0,suppressed:0,expired:0,cancelled:0,unavailable:0},radioDelivery:{samples:1,p95MS:5,maximumMS:5}},
 deliveries:[{id:"old",lifecycle:1,intent:"fuel.old",family:"fuel",text:"Ciclo anterior",mode:"audio",selectedAt:100,updatedAt:150,state:"completed",reason:"",visual:false,audio:"completed"},{id:"new",lifecycle:2,intent:"fuel.new",family:"fuel",text:"Quedan 12 litros",mode:"both",selectedAt:500,updatedAt:510,state:"completed",reason:"",visual:true,audio:"cache_miss"}],
};
function mount(initial=snapshot) {
 let push: (s:EngineerDiagnostics)=>void = ()=>{};
 const off=vi.fn();
 const bridge:EngineerBridge={subscribe(cb){push=cb;cb(initial);return off},refresh:vi.fn(),change:vi.fn(async()=>({outcome:"saved",diagnostics:initial})),testAudio:vi.fn(async()=>({kind:"tone",outcome:"completed",finishedAt:2000}))};
 const download=vi.fn();const copy=vi.fn(async()=>{});
 const view=render(<I18nProvider><EngineerOrbitPage bridge={bridge} download={download} copy={copy}/></I18nProvider>);
 return {bridge,off,download,copy,...view,push:(next:EngineerDiagnostics)=>act(()=>push(next))};
}
afterEach(()=>{cleanup();vi.useRealTimers()});
describe("functional Engineer",()=>{
 it("shows runtime error, cache miss and current cycle; history survives settings",()=>{
  const page=mount();expect(screen.getByRole("alert").textContent).toContain("error");
  expect(screen.getByText("Sin audio en caché")).toBeTruthy();expect(screen.queryByText("Ciclo anterior")).toBeNull();
  fireEvent.change(screen.getByLabelText("Ciclos"),{target:{value:"all"}});expect(screen.getByText("Ciclo anterior")).toBeTruthy();
  page.push({...snapshot,capturedAt:2000,status:{...snapshot.status,outputModes:{fuel:"disabled"}}});
  expect(screen.getByText("Quedan 12 litros").closest("tr")?.textContent).toContain("Audio y visual");
 });
 it("waits for backend confirmation and exposes save failure",async()=>{
  const {bridge}=mount();vi.mocked(bridge.change).mockResolvedValue({outcome:"save_failed",diagnostics:{...snapshot,status:{...snapshot.status,enabled:true}}});
  fireEvent.click(screen.getByLabelText("Ingeniero de pista"));
  await waitFor(()=>expect(screen.getByText(/no se ha podido guardar/i)).toBeTruthy());
  expect(bridge.change).toHaveBeenCalledWith({action:"enabled",enabled:true});
 });
 it("uses real player test and exposes result",async()=>{
  const {bridge}=mount();fireEvent.click(screen.getByRole("button",{name:"Probar sonido"}));
  await waitFor(()=>expect(screen.getByText(/reproductor ha terminado/i)).toBeTruthy());expect(bridge.testAudio).toHaveBeenCalledWith("tone");
 });
 it("freezes exact export preview before download or copy",async()=>{
  const page=mount();expect(screen.queryByRole("button",{name:"Descargar JSON"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Preparar informe"}));
  const preview=screen.getByLabelText("Contenido del informe").textContent;
  page.push({...snapshot,capturedAt:3000,deliveries:[]});
  fireEvent.click(screen.getByRole("button",{name:"Descargar JSON"}));expect(page.download).toHaveBeenCalledWith(preview);
  fireEvent.click(screen.getByRole("button",{name:"Copiar JSON"}));await waitFor(()=>expect(page.copy).toHaveBeenCalledWith(preview));
  expect(JSON.parse(preview!).capturedAt).toBe(1000);
 });
 it("marks missing responses stale and releases polling",()=>{
  vi.useFakeTimers();const page=mount();act(()=>vi.advanceTimersByTime(6000));
  expect(screen.getByText(/sin respuesta reciente/i)).toBeTruthy();expect(screen.getByLabelText("Ingeniero de pista").closest("fieldset")).toHaveProperty("disabled",true);
  const n=vi.mocked(page.bridge.refresh).mock.calls.length;page.unmount();act(()=>vi.advanceTimersByTime(3000));expect(page.off).toHaveBeenCalled();expect(page.bridge.refresh).toHaveBeenCalledTimes(n);
 });
 it("does not report success on command timeout",async()=>{
  const {bridge}=mount();vi.mocked(bridge.change).mockRejectedValue(new Error("timeout"));fireEvent.click(screen.getByLabelText("Ingeniero de pista"));
  await waitFor(()=>expect(screen.getByText(/no se ha recibido confirmación/i)).toBeTruthy());
 });
 it("keeps confirmed values until the backend replies",async()=>{
  const {bridge}=mount();
  let resolve!: (result:Awaited<ReturnType<EngineerBridge["change"]>>)=>void;
  vi.mocked(bridge.change).mockImplementation(()=>new Promise(done=>{resolve=done}));
  const control=screen.getByLabelText("Ingeniero de pista") as HTMLInputElement;
  fireEvent.click(control);expect(control.checked).toBe(false);
  expect(screen.getByText("Esperando confirmación…")).toBeTruthy();
  await act(async()=>resolve({outcome:"saved",diagnostics:{...snapshot,status:{...snapshot.status,enabled:true}}}));
  expect(control.checked).toBe(true);
 });
 it("routes every setting to a backend command",async()=>{
  const {bridge}=mount();
  fireEvent.click(screen.getByLabelText("Spotter",{selector:"input"}));
  await waitFor(()=>expect(bridge.change).toHaveBeenCalledWith({action:"spotter",enabled:false}));
  await waitFor(()=>expect(screen.getByText("Cambio aplicado y guardado.")).toBeTruthy());
  fireEvent.click(screen.getByLabelText("Subtítulos"));
  await waitFor(()=>expect(bridge.change).toHaveBeenCalledWith({action:"subtitles",enabled:false}));
  await waitFor(()=>expect(screen.getByText("Cambio aplicado y guardado.")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Sensibilidad del spotter"),{target:{value:"aggressive"}});
  await waitFor(()=>expect(bridge.change).toHaveBeenCalledWith({action:"sensitivity",value:"aggressive"}));
  await waitFor(()=>expect(screen.getByText("Cambio aplicado y guardado.")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Combustible"),{target:{value:"audio"}});
  await waitFor(()=>expect(bridge.change).toHaveBeenCalledWith({action:"output",category:"fuel",value:"audio"}));
 });
 it("retains subtitle preference while visual output is paused",()=>{
  mount({...snapshot,visualPresentationEnabled:false,status:{...snapshot.status,subtitlesEnabled:false}});
  expect(screen.getByLabelText("Subtítulos")).toHaveProperty("checked",true);
  expect(screen.getByText(/política de rendimiento ha pausado/i)).toBeTruthy();
 });

});

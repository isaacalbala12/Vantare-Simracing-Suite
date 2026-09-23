import { afterEach, expect, it, vi } from "vitest";
const bus = vi.hoisted(() => ({ listeners: new Map<string,(data:{data:unknown})=>void>(), emit: vi.fn(), off: vi.fn() }));
vi.mock("@wailsio/runtime",()=>({Events:{Emit:bus.emit,On:(name:string,cb:(data:{data:unknown})=>void)=>{bus.listeners.set(name,cb);return ()=>{bus.listeners.delete(name);bus.off(name)}}}}));
import { wailsEngineerBridge } from "./engineer-orbit-bridge";
afterEach(()=>{bus.listeners.clear();vi.clearAllMocks();vi.useRealTimers()});
it("correlates command result and ignores another request",async()=>{
 const promise=wailsEngineerBridge.change({action:"enabled",enabled:true});
 const [,request]=bus.emit.mock.calls[0];
 bus.listeners.get("engineer:command:result")!({data:{requestId:"other",outcome:"saved"}});
 expect(bus.off).not.toHaveBeenCalled();
 bus.listeners.get("engineer:command:result")!({data:[{requestId:request.requestId,outcome:"save_failed"}]});
 expect((await promise).outcome).toBe("save_failed");expect(bus.off).toHaveBeenCalledWith("engineer:command:result");
});
it("times out missing replies and removes listener",async()=>{
 vi.useFakeTimers();const reply=expect(wailsEngineerBridge.testAudio("tone")).rejects.toThrow("timeout");
 await vi.advanceTimersByTimeAsync(12000);await reply;expect(bus.listeners.size).toBe(0);
});
it("subscribes to diagnostics and unsubscribes",()=>{
 const receive=vi.fn();const off=wailsEngineerBridge.subscribe(receive);wailsEngineerBridge.refresh();
 expect(bus.emit).toHaveBeenCalledWith("engineer:diagnostics:get");
 bus.listeners.get("engineer:diagnostics")!({data:{version:1,status:{},deliveries:[]}});expect(receive).toHaveBeenCalledOnce();off();expect(bus.listeners.size).toBe(0);
});

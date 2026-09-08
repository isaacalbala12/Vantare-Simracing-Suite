import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ScheduleReviewNotice } from "./ScheduleReviewNotice";
import { recordPublishedCandidate } from "./schedule-review-receipt";
const listeners = new Map<string, (e: unknown) => void>();
const emit = vi.fn();
vi.mock("@wailsio/runtime", () => ({Events:{Emit:(...args:unknown[])=>emit(...args),On:(name:string,fn:(e:unknown)=>void)=>{listeners.set(name,fn);return()=>listeners.delete(name);}}}));
const candidate = {messageId:"123",sourceHash:"a",sourceText:"official",guildId:"1",channelId:"2",receivedAt:"2026-09-05T00:00:00Z",schedule:{validFrom:"2026-09-08T00:00:00Z",validUntil:"2026-09-15T00:00:00Z"}};
const mount = (owner = true) => {const navigate=vi.fn();const view=render(<I18nProvider><ScheduleReviewNotice owner={owner} onReview={navigate}/></I18nProvider>);return{...view,navigate};};
beforeEach(()=>{localStorage.clear();emit.mockClear();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));});
afterEach(()=>{cleanup();listeners.clear();vi.useRealTimers();});
it("notifica al Owner, mantiene un aviso y abre el candidato exacto",()=>{
 const {navigate}=mount();
 act(()=>listeners.get("schedule:discord:inbox")?.({data:{candidates:[candidate]}}));
 const review=screen.getByRole("button",{name:"Revisar horario"});
 fireEvent.click(review);expect(navigate).toHaveBeenCalledWith("schedule:123:a");
 act(()=>listeners.get("schedule:discord:inbox")?.({data:{candidates:[candidate]}}));
 expect(screen.getAllByTestId("calendar-review-notice")).toHaveLength(1);
 act(()=>recordPublishedCandidate(candidate));
 expect(screen.queryByTestId("calendar-review-notice")).toBeNull();
});
it("no consulta ni muestra la bandeja a quien no es Owner",()=>{mount(false);expect(emit).not.toHaveBeenCalled();expect(listeners.size).toBe(0);});
it("omite caducados y no resucita mensajes antiguos tras publicar el ultimo",()=>{
 recordPublishedCandidate(candidate);mount();
 act(()=>listeners.get("schedule:discord:inbox")?.({data:{candidates:[{...candidate,sourceHash:"old",receivedAt:"2026-09-04T00:00:00Z"},candidate]}}));
 expect(screen.queryByTestId("calendar-review-notice")).toBeNull();
 act(()=>listeners.get("schedule:discord:inbox")?.({data:{candidates:[{...candidate,schedule:{...candidate.schedule,validUntil:"2026-09-07T00:00:00Z"}}]}}));
 expect(screen.queryByTestId("calendar-review-notice")).toBeNull();
});
it("un horario nuevo vuelve a avisar y el recibo sobrevive al remontaje",()=>{
 recordPublishedCandidate(candidate);const view=mount();view.unmount();mount();
 act(()=>listeners.get("schedule:discord:inbox")?.({data:{candidates:[candidate]}}));expect(screen.queryByTestId("calendar-review-notice")).toBeNull();
 act(()=>listeners.get("schedule:discord:inbox")?.({data:{candidates:[{...candidate,sourceHash:"new",receivedAt:"2026-09-06T00:00:00Z"}]}}));expect(screen.getByTestId("calendar-review-notice")).toBeTruthy();
});

it("consulta mientras es visible y libera el temporizador al desmontar",()=>{
 const view=mount();const initial=emit.mock.calls.length;
 act(()=>vi.advanceTimersByTime(60000));expect(emit.mock.calls.length).toBeGreaterThan(initial);
 view.unmount();const count=emit.mock.calls.length;
 act(()=>vi.advanceTimersByTime(120000));expect(emit.mock.calls.length).toBe(count);expect(listeners.size).toBe(0);
});

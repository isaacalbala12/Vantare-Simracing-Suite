import { describe, expect, it } from "vitest";
import { downloadDiagnostics } from "./engineer-orbit-model";
import { vi } from "vitest";
describe("diagnostic download",()=>{
 it("downloads the preview as JSON and releases its URL",()=>{
  const create=vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:report");
  const revoke=vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});
  const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe("vantare-engineer-diagnostics.json");expect(this.href).toBe("blob:report")});
  downloadDiagnostics('{"version":1}');expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);expect(click).toHaveBeenCalledOnce();expect(revoke).toHaveBeenCalledWith("blob:report");vi.restoreAllMocks();
 });
});

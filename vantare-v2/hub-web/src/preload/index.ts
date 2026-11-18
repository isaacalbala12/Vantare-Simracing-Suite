import { contextBridge, ipcRenderer, webFrame } from "electron";
import {
  launcherReviewChannel,
  reviewResult,
  reviewTicket,
} from "../contract/launcher-review-bridge";

let connecting = false;
contextBridge.exposeInMainWorld("vantare", {
  platform: process.platform,
  async reviewTrust(...args: unknown[]) {
    const ticket = reviewTicket(args);
    if (!ticket) return "unavailable";
    try {
      return reviewResult(
        await ipcRenderer.invoke(launcherReviewChannel, ticket),
      );
    } catch {
      // The invoke may have been interrupted after Main sent the decision.
      return "interrupted";
    }
  },
  viewport() {
    // Client area in DIP, excluding Windows' invisible resize frame. The visual
    // viewport retains subpixel precision after Chromium applies page zoom.
    const factor = webFrame.getZoomFactor();
    return {
      width: (window.visualViewport?.width ?? window.innerWidth) * factor,
      height: (window.visualViewport?.height ?? window.innerHeight) * factor,
    };
  },
  connect() {
    if (connecting) return Promise.reject(new Error("Already connected"));
    connecting = true;
    return new Promise<void>((resolve, reject) => {
      const receive = (event: Electron.IpcRendererEvent) => {
        clearTimeout(timer);
        window.postMessage("vantare:port", "*", event.ports);
        resolve();
      };
      const timer = setTimeout(() => {
        ipcRenderer.removeListener("vantare:port", receive);
        connecting = false;
        reject(new Error("Host port unavailable"));
      }, 10000);
      ipcRenderer.once("vantare:port", receive);
      ipcRenderer.send("vantare:connect");
    });
  },
});

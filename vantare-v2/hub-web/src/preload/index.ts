import { contextBridge, ipcRenderer } from "electron";

let connecting = false;
contextBridge.exposeInMainWorld("vantare", {
  platform: process.platform,
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

import { contextBridge, ipcRenderer } from "electron";

let connecting = false;
contextBridge.exposeInMainWorld("vantare", {
  platform: process.platform,
  connect() {
    if (connecting) return Promise.reject(new Error("Already connected"));
    connecting = true;
    return new Promise<void>((resolve) => {
      ipcRenderer.once("vantare:port", (event) => {
        window.postMessage("vantare:port", "*", event.ports);
        resolve();
      });
      ipcRenderer.send("vantare:connect");
    });
  },
});

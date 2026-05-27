const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ao", {
  state: (payload) => ipcRenderer.invoke("gui:state", payload),
  addProject: (payload) => ipcRenderer.invoke("gui:add-project", payload),
  useProject: (payload) => ipcRenderer.invoke("gui:use-project", payload),
  chooseDirectory: () => ipcRenderer.invoke("gui:choose-directory"),
  startRun: (payload) => ipcRenderer.invoke("gui:start-run", payload),
  runProcess: () => ipcRenderer.invoke("gui:run-process"),
  snapshot: (payload) => ipcRenderer.invoke("gui:snapshot", payload),
  openPath: (payload) => ipcRenderer.invoke("gui:open-path", payload)
});

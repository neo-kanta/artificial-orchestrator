import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDuet } from "../src/orchestrator.js";
import { addGuiProject, createGuiRunOptions, guiRunHistory, guiRunSnapshot, guiState, useGuiProject } from "../src/gui.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let activeRun = null;
let lastRunError = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#f7f6f2",
    title: "Artificial Orchestrator",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpc() {
  ipcMain.handle("gui:state", async (_event, payload = {}) => ({
    ...(await guiState(payload)),
    activeRun: publicRun(activeRun),
    lastRunError
  }));

  ipcMain.handle("gui:add-project", async (_event, payload = {}) => addGuiProject(payload));
  ipcMain.handle("gui:use-project", async (_event, payload = {}) => useGuiProject(payload));

  ipcMain.handle("gui:choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("gui:start-run", async (_event, payload = {}) => {
    if (activeRun) {
      throw new Error(`A run is already active for ${activeRun.project?.name ?? activeRun.workspace}.`);
    }

    const options = await createGuiRunOptions(payload);
    const runRecord = {
      workspace: options.workspace,
      project: options.project,
      goal: options.goal,
      startedAt: new Date().toISOString(),
      error: null
    };

    activeRun = runRecord;
    lastRunError = null;

    runRecord.promise = runDuet(options)
      .catch((error) => {
        runRecord.error = errorMessage(error);
        lastRunError = {
          at: new Date().toISOString(),
          workspace: runRecord.workspace,
          message: runRecord.error
        };
      })
      .finally(() => {
        if (activeRun === runRecord) activeRun = null;
      });

    return {
      started: true,
      activeRun: publicRun(runRecord)
    };
  });

  ipcMain.handle("gui:run-process", async () => ({
    activeRun: publicRun(activeRun),
    lastRunError
  }));

  ipcMain.handle("gui:snapshot", async (_event, payload = {}) => {
    const workspace = payload.workspace ?? activeRun?.workspace;
    if (!workspace) return null;
    return guiRunSnapshot(workspace, payload);
  });

  ipcMain.handle("gui:history", async (_event, payload = {}) => {
    const workspace = payload.workspace ?? activeRun?.workspace;
    if (!workspace) return [];
    return guiRunHistory(workspace, payload);
  });

  ipcMain.handle("gui:open-path", async (_event, payload = {}) => {
    const path = String(payload.path ?? "");
    if (!path) throw new Error("No path supplied.");
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
    return true;
  });
}

function publicRun(run) {
  if (!run) return null;
  return {
    workspace: run.workspace,
    project: run.project,
    goal: run.goal,
    startedAt: run.startedAt,
    error: run.error
  };
}

function errorMessage(error) {
  return error?.message ? error.message : String(error);
}

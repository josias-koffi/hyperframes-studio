import { contextBridge, ipcRenderer } from "electron";

/** What the studio's pages know of the window: the system it runs on, and how to colour its buttons. */
contextBridge.exposeInMainWorld("framesmith", {
  platform: process.platform,
  setTitleBarTheme: (theme: "light" | "dark") => ipcRenderer.send("title-bar:theme", theme),
});

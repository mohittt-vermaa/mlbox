"use strict";
// mlbox desktop shell: a minimal Electron window pointed at a loopback static
// server. The app itself is the same static site the GitHub Pages build serves —
// nothing here touches the network beyond 127.0.0.1.
const { app, BrowserWindow, shell } = require("electron");
const { createStaticServer } = require("./static-server.cjs");

const server = createStaticServer(app.getAppPath());

app.whenReady().then(() => {
  server.listen(0, "127.0.0.1", () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const win = new BrowserWindow({
      width: 1320,
      height: 940,
      minWidth: 940,
      minHeight: 640,
      backgroundColor: "#0b0f14",
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.once("ready-to-show", () => win.show());
    win.setMenuBarVisibility(false);
    win.loadURL(`${origin}/index.html`);

    // links to anywhere else (GitHub, provider pricing pages) leave the app
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith(origin + "/")) return;
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    });
  });
});

app.on("window-all-closed", () => {
  server.close();
  app.quit();
});

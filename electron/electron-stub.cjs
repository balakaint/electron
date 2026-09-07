// Minimal stand-in for the `electron` module so main.ts can be imported
// outside Electron, for window-state.test.ts.
//
// main.ts registers app/ipcMain listeners at module level, so importing
// it needs those to exist. This provides only enough surface for that;
// the test exercises one pure function, not the runtime. Anything the
// test does not reach is a no-op on purpose — if a future test needs
// real behaviour here, that is a sign it should be testing something
// else.
const noop = () => {};

const chainable = {
  on: noop,
  handle: noop,
  once: noop,
  whenReady: () => Promise.resolve(),
  requestSingleInstanceLock: () => true,
  getPath: () => '/tmp',
  quit: noop,
  setLoginItemSettings: noop,
  isReady: () => true,
  setAppUserModelId: noop,
};

module.exports = {
  app: chainable,
  ipcMain: chainable,
  shell: chainable,
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
  },
  dialog: { showErrorBox: noop },
  Menu: { setApplicationMenu: noop, buildFromTemplate: () => ({ popup: noop }) },
  nativeTheme: {},
  screen: {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
  },
};

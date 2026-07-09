const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const testUrl = process.env.CIF_UI_TEST_URL;
if (!testUrl) throw new Error('CIF_UI_TEST_URL is required.');

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function measure(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const fieldset = document.querySelector('fieldset');
      if (!dialog || !fieldset) return { found: false };

      const dialogRect = dialog.getBoundingClientRect();
      const controls = Array.from(dialog.querySelectorAll('button, input, select, fieldset, table'));
      const outsideControls = controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < dialogRect.left ||
          rect.right > dialogRect.right ||
          rect.top < dialogRect.top ||
          rect.bottom > dialogRect.bottom
        );
      });
      const axisGroups = Array.from(fieldset.querySelectorAll(':scope > div > div'));
      const axisRows = new Set(
        axisGroups.map((element) => Math.round(element.getBoundingClientRect().top))
      ).size;
      const restraintsPanel = dialog.querySelector('[aria-live="polite"]');
      const formColumn = fieldset.parentElement;

      return {
        found: true,
        viewport: { width: innerWidth, height: innerHeight },
        dialogInsideViewport:
          dialogRect.left >= 0 &&
          dialogRect.right <= innerWidth &&
          dialogRect.top >= 0 &&
          dialogRect.bottom <= innerHeight,
        dialogScrollable:
          dialog.scrollWidth > dialog.clientWidth || dialog.scrollHeight > dialog.clientHeight,
        pageScrollable:
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
        outsideControlCount: outsideControls.length,
        axisRows,
        restraintsHeight: restraintsPanel
          ? Math.round(restraintsPanel.getBoundingClientRect().height)
          : null,
        formRowGap: formColumn ? getComputedStyle(formColumn).rowGap : null
      };
    })()
  `);
}

async function runScenario(window, scenario) {
  window.webContents.setZoomFactor(scenario.zoom);
  window.setContentSize(scenario.width, scenario.height);
  await pause(100);

  const result = await measure(window);
  assert.equal(result.found, true, `${scenario.name}: dialog did not render`);
  assert.equal(result.dialogInsideViewport, true, `${scenario.name}: dialog left the viewport`);
  assert.equal(result.dialogScrollable, false, `${scenario.name}: dialog became scrollable`);
  assert.equal(result.pageScrollable, false, `${scenario.name}: page became scrollable`);
  assert.equal(result.outsideControlCount, 0, `${scenario.name}: controls left the dialog`);
  if (scenario.expectedAxisRows) {
    assert.equal(result.axisRows, scenario.expectedAxisRows, `${scenario.name}: unexpected cell-length wrapping`);
  }
  assert.equal(result.restraintsHeight, 120, `${scenario.name}: restraints panel is not 120px tall`);

  console.log(
    `✓ ${scenario.name} (${result.viewport.width}x${result.viewport.height}, zoom ${scenario.zoom},` +
      ` restraints ${result.restraintsHeight}px, form row gap ${result.formRowGap})`
  );
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    useContentSize: true,
    backgroundColor: '#f3f3f3',
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  await window.loadURL(testUrl);
  await runScenario(window, {
    name: 'minimum application viewport',
    width: 1100,
    height: 650,
    zoom: 1,
    expectedAxisRows: 2
  });
  await runScenario(window, {
    name: 'default application viewport',
    width: 1200,
    height: 800,
    zoom: 1,
    expectedAxisRows: 2
  });
  await runScenario(window, {
    name: 'narrow viewport wrapping',
    width: 900,
    height: 800,
    zoom: 1,
    expectedAxisRows: 2
  });
  await runScenario(window, {
    name: '125 percent zoom at default size',
    width: 1200,
    height: 800,
    zoom: 1.25,
    expectedAxisRows: 2
  });

  window.destroy();
}

app.whenReady().then(run).then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  }
);


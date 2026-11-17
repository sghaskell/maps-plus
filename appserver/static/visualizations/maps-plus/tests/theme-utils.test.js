/** @jest-environment jsdom */
'use strict';

const path = require('path');

// theme-utils.js is an AMD module: define([], factory). Capture the factory's
// return value with a stub define, then load the file.
function loadThemeUtils() {
  let captured = null;
  global.define = (deps, factory) => { captured = factory(); };
  jest.isolateModules(() => {
    require(path.join(__dirname, '..', 'contrib', 'js', 'theme-utils.js'));
  });
  delete global.define;
  return captured;
}

function cleanDom() {
  delete window.__splunk_page_theme__;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
}

describe('theme-utils getCurrentTheme', () => {
  let themeUtils;

  beforeAll(() => {
    themeUtils = loadThemeUtils();
  });

  beforeEach(() => {
    cleanDom();
  });

  afterEach(() => {
    cleanDom();
  });

  test('exposes getCurrentTheme', () => {
    expect(typeof themeUtils.getCurrentTheme).toBe('function');
  });

  test('__splunk_page_theme__ = dark returns dark', () => {
    window.__splunk_page_theme__ = 'dark';
    expect(themeUtils.getCurrentTheme()).toBe('dark');
  });

  test('meta color-scheme dark returns dark', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="dark"/>';
    expect(themeUtils.getCurrentTheme()).toBe('dark');
  });

  test('meta color-scheme light returns light', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="light"/>';
    expect(themeUtils.getCurrentTheme()).toBe('light');
  });

  test('meta color-scheme with unexpected value falls through to light', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="auto"/>';
    expect(themeUtils.getCurrentTheme()).toBe('light');
  });

  test('requirejs meta with /custom_viz/dark/ returns dark', () => {
    document.head.innerHTML =
      '<meta name="custom-viz-requirejs-script" content="/static/app/custom_viz/dark/maps.js"/>';
    expect(themeUtils.getCurrentTheme()).toBe('dark');
  });

  test('requirejs meta with /custom_viz/light/ returns light', () => {
    document.head.innerHTML =
      '<meta name="custom-viz-requirejs-script" content="/static/app/custom_viz/light/maps.js"/>';
    expect(themeUtils.getCurrentTheme()).toBe('light');
  });

  test('nothing set returns light', () => {
    expect(themeUtils.getCurrentTheme()).toBe('light');
  });

  test('window global takes precedence over meta', () => {
    window.__splunk_page_theme__ = 'light';
    document.head.innerHTML = '<meta name="color-scheme" content="dark"/>';
    expect(themeUtils.getCurrentTheme()).toBe('light');
  });
});

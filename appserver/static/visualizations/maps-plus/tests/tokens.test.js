const { setTokens, tokenDeps, usesDrilldown } = require('../src/compat/tokens')

describe('setTokens', () => {
  const tokens = { clickedLat: '1', clickedLng: '2', clickedLatLng: '1,2' }
  test('no splunkjs -> drilldown once', () => {
    const viz = { drilldown: jest.fn() }
    const ev = {}
    expect(setTokens(viz, tokens, ev, { FIELD_VALUE_DRILLDOWN: 'FVD' })).toBe('drilldown')
    expect(viz.drilldown).toHaveBeenCalledTimes(1)
    // The DOM event is deliberately not forwarded (can't be cloned across Studio's iframe).
    expect(viz.drilldown).toHaveBeenCalledWith({ action: 'FVD', data: tokens })
  })
  test('splunkjs -> both models set, no drilldown', () => {
    const d = { set: jest.fn() }, s = { set: jest.fn() }
    const splunkjs = { mvc: { Components: { get: (n) => (n === 'default' ? d : s) } } }
    const viz = { drilldown: jest.fn() }
    expect(setTokens(viz, tokens, undefined, { splunkjs, FIELD_VALUE_DRILLDOWN: 'FVD' })).toBe('splunkjs')
    expect(d.set).toHaveBeenCalledWith('clickedLatLng', '1,2')
    expect(s.set).toHaveBeenCalledTimes(3)
    expect(viz.drilldown).not.toHaveBeenCalled()
  })
  test('Studio stand-in splunkjs in a sandboxed frame -> drilldown, models untouched', () => {
    // Dashboard Studio mocks splunkjs.mvc.Components inside its null-origin iframe; tokens set
    // there never reach the dashboard, so the drilldown must win.
    const d = { set: jest.fn() }
    const win = { location: { origin: 'null', protocol: 'about:' }, splunkjs: { mvc: { Components: { get: () => d } } } }
    const deps = tokenDeps('FVD', win)
    expect(deps.sandboxed).toBe(true)
    expect(deps.splunkjs).toBeUndefined()
    expect(usesDrilldown(deps)).toBe(true)
    const viz = { drilldown: jest.fn() }
    expect(setTokens(viz, tokens, undefined, deps)).toBe('drilldown')
    expect(viz.drilldown).toHaveBeenCalledWith({ action: 'FVD', data: tokens })
    expect(d.set).not.toHaveBeenCalled()
  })
  test('classic page with splunkjs -> tokenDeps keeps it', () => {
    const splunkjs = { mvc: { Components: { get: () => ({ set: jest.fn() }) } } }
    const deps = tokenDeps('FVD', { location: { origin: 'https://splunk.example', protocol: 'https:' }, splunkjs })
    expect(deps.sandboxed).toBe(false)
    expect(deps.splunkjs).toBe(splunkjs)
    expect(usesDrilldown(deps)).toBe(false)
  })
  test('sandboxed flag overrides a splunkjs passed in directly', () => {
    const d = { set: jest.fn() }
    const viz = { drilldown: jest.fn() }
    const deps = { splunkjs: { mvc: { Components: { get: () => d } } }, sandboxed: true, FIELD_VALUE_DRILLDOWN: 'FVD' }
    expect(setTokens(viz, tokens, undefined, deps)).toBe('drilldown')
    expect(d.set).not.toHaveBeenCalled()
  })
  test('drilldown throwing does not throw', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const viz = { drilldown: jest.fn(() => { throw new Error('x') }) }
    expect(setTokens(viz, tokens, undefined, {})).toBe('drilldown')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

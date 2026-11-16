const { setTokens } = require('../src/compat/tokens')

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
  test('drilldown throwing does not throw', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const viz = { drilldown: jest.fn(() => { throw new Error('x') }) }
    expect(setTokens(viz, tokens, undefined, {})).toBe('drilldown')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

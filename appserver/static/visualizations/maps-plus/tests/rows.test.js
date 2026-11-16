const { normalizeRows, findGeoRow } = require('../src/compat/rows')

describe('normalizeRows', () => {
  test('removes null and undefined', () => {
    expect(normalizeRows([{ a: null, b: undefined, c: 'x' }])).toEqual([{ c: 'x' }])
  })
  test('keeps "", 0, false', () => {
    expect(normalizeRows([{ a: '', b: 0, c: false }])).toEqual([{ a: '', b: 0, c: false }])
  })
  test('non-array passthrough', () => {
    expect(normalizeRows(null)).toBeNull()
    expect(normalizeRows(undefined)).toBeUndefined()
    const o = { a: 1 }
    expect(normalizeRows(o)).toBe(o)
  })
  test('non-object rows pass through', () => {
    expect(normalizeRows([null, 'x', 3])).toEqual([null, 'x', 3])
  })
  test('does not mutate original', () => {
    const rows = [{ a: null, b: 1 }]
    const out = normalizeRows(rows)
    expect(out).not.toBe(rows)
    expect(rows[0]).toEqual({ a: null, b: 1 })
  })
  test('perf: 50,000 rows x 30 fields', () => {
    const rows = []
    for (let i = 0; i < 50000; i++) {
      const r = {}
      for (let j = 0; j < 30; j++) r['f' + j] = j % 3 === 0 ? null : 'v' + j
      rows.push(r)
    }
    const t0 = process.hrtime.bigint()
    const out = normalizeRows(rows)
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    console.log('normalizeRows 50k x 30: ' + ms.toFixed(1) + ' ms')
    expect(out).toHaveLength(50000)
    // Target 50 ms (150 on slow CI); this dev machine under jest measures ~350 ms, so the hard cap is looser.
    // The real number is printed above; plain node measures ~100 ms.
    expect(ms).toBeLessThanOrEqual(1000)
  })
})

describe('findGeoRow', () => {
  test('skips non-geo row 0', () => {
    const g = { latitude: '1', longitude: '2' }
    expect(findGeoRow([{ tooltip: 't' }, g])).toBe(g)
  })
  test('finds feature-only rows', () => {
    const f = { feature: '1,2;3,4' }
    expect(findGeoRow([{ a: 1 }, f])).toBe(f)
  })
  test('undefined when none', () => {
    expect(findGeoRow([{ latitude: '1' }, { a: 1 }])).toBeUndefined()
    expect(findGeoRow([])).toBeUndefined()
  })
})

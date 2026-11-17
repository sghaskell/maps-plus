// Smoke test: proves the Jest toolchain works. Real tests are added per defect (MP-xx).
const _ = require('underscore');

test('underscore _.omit accepts a predicate (needed by MP-02 row normalisation)', () => {
  const row = { a: 1, b: null, c: undefined, d: '', e: 0, f: false };
  expect(_.omit(row, (v) => v == null)).toEqual({ a: 1, d: '', e: 0, f: false });
});

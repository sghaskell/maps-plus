/** @jest-environment jsdom */
// Debug overlay (debug builds only): records errors and replies to a postMessage dump request.
const overlay = require('../src/compat/debug-overlay');

function FakeViz() {}
FakeViz.prototype.updateView = function () { throw new Error('boom in updateView'); };
FakeViz.prototype.formatData = function (d) { return d; };

test('wrapped lifecycle errors are logged and rethrown', () => {
  overlay.install(FakeViz);
  expect(() => new FakeViz().updateView()).toThrow('boom in updateView');
  expect(document.body.textContent).toContain('in updateView: boom in updateView');
});

test('replies to a mapsPlusDebugDump request with the full log', () => {
  const replies = [];
  const source = { postMessage: (msg) => replies.push(msg) };
  window.dispatchEvent(new MessageEvent('message', { data: { mapsPlusDebugDump: true }, source }));
  expect(replies).toHaveLength(1);
  expect(replies[0].mapsPlusDebugLog).toContain('boom in updateView');
});

test('ignores unrelated messages', () => {
  const replies = [];
  const source = { postMessage: (msg) => replies.push(msg) };
  window.dispatchEvent(new MessageEvent('message', { data: { something: 1 }, source }));
  expect(replies).toHaveLength(0);
});

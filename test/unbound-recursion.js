var test = require('tape');
var expand = require('..');

// `performance` is only a global from Node 16 on, while this package is still
// tested down to Node 10; fall back to the built-in perf_hooks module, which
// has shipped since Node 8.5.
var performance = (typeof globalThis !== 'undefined' && globalThis.performance) || require('perf_hooks').performance;


// https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-3jxr-9vmj-r5cp
test('unbound recursion', async t => {
  // A run of non-expanding `{}` groups used to expand `post` once per group,
  // doubling the work on every group. This 30-group, 90 byte input blocked
  // for minutes.
  const str =
    'a{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}'
  const startTime = performance.now()
  const expanded = expand(str)
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  t.deepEqual(expanded, [str], 'does not expand')
  t.ok(
    timeTaken < 1000,
    `Expected time (${timeTaken}ms) to be less than 1000ms`,
  )
  t.end()
})

test('unbound recursion - long run of non-expanding groups', function (t) {
  // Same shape, scaled up. Eagerly expanding `post` also recursed once per
  // group, so this input died with `RangeError: Maximum call stack size
  // exceeded` long before any deadline could be reached. Expansion is now
  // iterative, so the recursion depth stays at 1 however many groups there are.
  var groups = 3000
  var str = 'a'
  for (var i = 0; i < groups; i++) {
    str += (i === 0 ? '' : ',') + '{}'
  }
  t.deepEqual(expand(str), [str], 'does not expand, does not exhaust the stack')
  t.end()
})

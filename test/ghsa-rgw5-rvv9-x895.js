var test = require('tape');
var expand = require('..');

// `performance` is only a global from Node 16 on, while this package is still
// tested down to Node 10; fall back to the built-in perf_hooks module, which
// has shipped since Node 8.5.
var performance = (typeof globalThis !== 'undefined' && globalThis.performance) || require('perf_hooks').performance;

// Bypass of CVE-2026-14257's mitigation: each comma-separated alternative
// (`{alt,alt,...}`) is expanded independently, and `maxLength` only bounded
// each alternative's own output, not the running total accumulated across
// all of them. Many alternatives - each individually far under `maxLength` -
// could still sum to an unbounded intermediate array before the final
// `combine` call ever got a chance to truncate.
test('total length across comma alternatives is bounded', async t => {
  var alt = '{1..5}'
  var str = '{' + Array(1000).fill(alt).join(',') + '}'
  var startTime = performance.now()
  var expanded = expand(str, { maxLength: 50 })
  var endTime = performance.now()

  var totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    totalLength <= 50,
    `Expected total length (${totalLength}) to respect maxLength`,
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  // Guards against an algorithmic regression, not against the CVE itself - the
  // bounded-length assertions carry the security signal (unpatched, this input
  // grows the intermediate array until the process aborts). The bound is
  // generous because the oldest legs of the test matrix run on shared CI
  // hardware.
  t.ok(
    endTime - startTime < 5000,
    `Expected time (${endTime - startTime}ms) to be less than 5000ms`,
  )

  // Regression case from the report: 400 alternatives, each individually
  // bounded by maxLength but unbounded in aggregate before the fix.
  var part = '{' + '0'.repeat(50) + '1..100000}'
  var bigStr = '{' + Array(400).fill(part).join(',') + '}'
  t.doesNotThrow(() => {
    var bigExpanded = expand(bigStr)
    var bigTotal = bigExpanded.reduce((sum, s) => sum + s.length, 0)
    t.ok(
      bigTotal <= 4000000,
      `Expected total length (${bigTotal}) to stay bounded`,
    )
  })

  t.end();
})

// A padded sequence's element width follows the input, so generating all `max`
// elements before `combine` could discard them cost time proportional to
// `max * width` - a ~400KB input blocked the event loop for over two minutes.
test('padded sequences respect maxLength while generating', async t => {
  var str = '{' + '0'.repeat(400000) + '1..100000}'
  var startTime = performance.now()
  var expanded = expand(str)
  var elapsed = performance.now() - startTime

  var totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    totalLength <= 4000000,
    `Expected total length (${totalLength}) to stay bounded`,
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  // As above: a generous algorithmic-regression guard, not the security signal.
  // Unpatched, this input generates every element at full padded width and
  // blocks the event loop for minutes before exhausting memory.
  t.ok(
    elapsed < 10000,
    `Expected time (${elapsed}ms) to be less than 10000ms`,
  )

  // Truncating early must not change results that fit within the bound.
  t.same(
    expand('{01..10}'),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    'padded sequences under the bound are unaffected',
  )

  t.end();
})

// Bounding the intermediate `values` array must not change what `max` counts:
// alternatives that expand to nothing are dropped by `combine`, so they cost a
// slot in `values` but never a result.
test('max bounds the number of kept results', async t => {
  t.same(
    expand('{a,,b}', { max: 2 }),
    ['a', 'b'],
    'dropped empty alternatives do not count against max',
  )
  t.same(
    expand('{a,,,b,c}', { max: 3 }),
    ['a', 'b', 'c'],
    'consecutive empty alternatives do not count against max',
  )
  // Here the empties survive as `xy`, so they are results and do count.
  t.same(
    expand('x{a,,b}y', { max: 2 }),
    ['xay', 'xy'],
    'kept empty alternatives still count against max',
  )

  t.end();
})

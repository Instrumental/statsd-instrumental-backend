var test = require('tape');
var instrumental = require("../lib/instrumental.js");
var config = require("../exampleConfig.js").config;
var dummy_events =  { on: function(e){ } };
var now = Math.round(new Date().getTime() / 1000);

test('no filtering is done if no config specified', function (t) {
  var metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1.rate': 280.5 },
    gauges: { 'my.gauge.1': 100 },
    sets: { 'my.set.1': ['1','2','3'] }
  };

  instrumental.init(now, config, dummy_events);

  var payload = instrumental.build_payload(metrics);
  t.assert(payload.length === 4)

  t.pass()
  t.end();
});

test('no filtering is done if emptyconfig specified', function (t) {
  var metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1.rate': 280.5 },
    gauges: { 'my.gauge.1': 100 },
    sets: { 'my.set.1': ['1','2','3'] }
  };

  instrumental.init(now, config, dummy_events);

  config.instrumental.metricFilters = [];
  var payload = instrumental.build_payload(metrics);
  t.assert(payload.length === 4)

  t.pass()
  t.end();
});

test('regex filters work as expected', function (t) {
  var metrics = {
    counters: { 'filter.start.expression': 2805,
                'filter.middle.expression': 2805 },
    counter_rates: { 'filter.end.expression': 280.5 },
    gauges: { 'end.expression.false.positive': 100 },
    sets: { 'false.positive.filter.start': ['1','2','3'] }
  };

  config.instrumental.metricFilters = [/^filter.start.*/, /.*filter.end$/, /\.middle\./];
  instrumental.init(now, config, dummy_events);

  var payload = instrumental.build_payload(metrics);
  t.assert(payload.length === 2)

  config.instrumental.metricFilters = [];
  t.pass()
  t.end();
});

var test = require('tape');
var instrumental = require("../lib/instrumental.js");
var config = require("../exampleConfig.js").config;

test('counter_rate should not report if disabled in configuration', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1': 280.5 }
  };

  now = Math.round(new Date().getTime() / 1000);
  dummy_events =  { on: function(e){ } };
  config.instrumental.recordCounterRates = true;
  instrumental.init(now, config, dummy_events);

  // Enable rate counters and ensure they are recorded
  payload = instrumental.build_payload(metrics);
  
  // TODO: What's with the fucking space on the end of this string?
   t.assert(payload.indexOf("gauge_absolute my.test.1.rate 280.5 ") > -1, "Expected a rate metric, got: " + JSON.stringify(payload))

  // Disable rate counters and ensure they are NOT recorded
  config.instrumental.recordCounterRates = false;
  instrumental.init(now, config, dummy_events);

  payload = instrumental.build_payload(metrics);
  payload.forEach(function(instrumental_metric) {
    if (instrumental_metric.indexOf("rate") > -1) {
      t.fail("Should not be any rate metrics: " + instrumental_metric);
    } else {
      t.pass();
    }
  })

  t.end();
});

test('metricPrefix is used if present in configuration', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 }
  };

  now = Math.round(new Date().getTime() / 1000);
  dummy_events =  { on: function(e){ } };

  config.instrumental.metricPrefix = "testprefix";
  instrumental.init(now, config, dummy_events);

  payload = instrumental.build_payload(metrics);

  t.assert(payload.indexOf("increment testprefix.my.test.1 2805 ") > -1, "Metric name was not prefixed properly (got " + JSON.stringify(payload) + ")");

  t.end();
});

test('metricPrefix ending with dots wont send double dots', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 }
  };

  now = Math.round(new Date().getTime() / 1000);
  dummy_events =  { on: function(e){ } };

  config.instrumental.metricPrefix = "testprefix.";
  instrumental.init(now, config, dummy_events);

  payload = instrumental.build_payload(metrics);

  t.assert(payload.indexOf("increment testprefix.my.test.1 2805 ") > -1, "Metric name was not prefixed properly (got " + JSON.stringify(payload) + ")");

  t.end();
});

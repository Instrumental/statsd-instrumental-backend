var test = require('tape');
// import 'core-js'
//import { build_payload } from "../lib/instrumental.js";
var instrumental = require("../lib/instrumental.js");
var config = require("../exampleConfig.js").config;

test('counter_rate should not report if disabled in configuration', function (t) {
  var metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1': 280.5 }
  };

  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };
  instrumental.init(now, config, dummy_events)

  // Enable rate counters and ensure they are recorded
  var payload = instrumental.build_payload(metrics)

  // TODO: What's with the fucking space on the end of this string?
   t.assert(payload.indexOf("gauge_absolute my.test.1.rate 280.5 ") > -1, "Expected a rate metric, got: " + JSON.stringify(payload))

  // Disable rate counters and ensure they are NOT recorded
  config.instrumental.recordCounterRates = false;
  instrumental.init(now, config, dummy_events);

  var payload = instrumental.build_payload(metrics);
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
  var metrics = {
    counters: { 'my.test.1': 2805 }
  };

  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };

  config.instrumental.metricPrefix = "testprefix";
  instrumental.init(now, config, dummy_events)

  var payload = instrumental.build_payload(metrics);

   t.assert(payload.indexOf("increment testprefix.my.test.1 2805 ") > -1, "Metric name was not prefixed properly (got " + JSON.stringify(payload) + ")")

  t.end();
});

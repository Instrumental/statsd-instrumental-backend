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

  // console.log("CONFIG: " + JSON.stringify(config));
  // console.log("INSTRUMENTAL: " + JSON.stringify(config.instrumental));

  // Enable rate counters and ensure they are recorded
  config.instrumental.recordCounterRates = true;
  var payload = instrumental.build_payload(metrics);

  //var expected_payload = ["increment my.test.1 2805 ","gauge_absolute my.test.1.rate 280.5 "]
  //  t.equal(expected_payload, payload)
  //  t.fail("record_counter_rates should have a default")

  // TODO: What's with the fucking space on the end of this string?
   t.assert(payload.indexOf("gauge_absolute my.test.1.rate 280.5 ") > -1, "Expected a rate metric, got: " + JSON.stringify(payload))

  // Disable rate counters and ensure they are NOT recorded
  config.instrumental.record_counter_rates = false;
  var payload = instrumental.build_payload(metrics);
  payload.forEach(function(instrumental_metric) {
    if (instrumental_metric.indexOf("rate") > -1) {
      t.fail("Should not be any rate metrics: " + instrumental_metric);
    } else {
      t.pass();
    }
  })


// [ 'gauge_absolute statsd.bad_lines_seen.rate 0 ', 'increment statsd.packets_received 581 ', 'gauge_absolute statsd.packets_received.rate 58.1 ', 'increment my.test.1 2805 ', 'gauge_absolute my.test.1.rate 280.5 ', 'gauge_absolute my.test.1.count_90 9 ', 'gauge_absolute my.test.1.mean_90 0.3333333333333333 ', 'gauge_absolute my.test.1.upper_90 1 ', 'gauge_absolute my.test.1.sum_90 3 ', 'gauge_absolute my.test.1.sum_squares_90 3 ', 'gauge_absolute my.test.1.std 0.4898979485566356 ', 'gauge_absolute my.test.1.upper 1 ', 'gauge_absolute my.test.1.lower 0 ', 'gauge_absolute my.test.1.count 10 ', 'gauge_absolute my.test.1.count_ps 1 ', 'gauge_absolute my.test.1.sum 4 ', 'gauge_absolute my.test.1.sum_squares 4 ', 'gauge_absolute my.test.1.mean 0.4 ', 'gauge_absolute my.test.1.median 0 ', 'gauge my.test.1 4 ', 'gauge statsd.timestamp_lag 0 ' ]


  // assert payload is an array
  // assert array does not contain any counter_rate metrics

  t.end();
});



/*
var metrics = {
  counters:
 { 'statsd.bad_lines_seen': 0,
   'statsd.packets_received': 581,
   'my.test.1': 2805 },
gauges: { 'my.test.1': 4, 'statsd.timestamp_lag': 0 },
timers: { 'my.test.1': [ 0, 0, 0, 0, 0, 0, 1, 1, 1, 1 ] },
timer_counters: { 'my.test.1': 10 },
sets: {},
counter_rates:
 { 'statsd.bad_lines_seen': 0,
   'statsd.packets_received': 58.1,
   'my.test.1': 280.5 },
timer_data:
 { 'my.test.1':
    { count_90: 9,
      mean_90: 0.3333333333333333,
      upper_90: 1,
      sum_90: 3,
      sum_squares_90: 3,
      std: 0.4898979485566356,
      upper: 1,
      lower: 0,
      count: 10,
      count_ps: 1,
      sum: 4,
      sum_squares: 4,
      mean: 0.4,
      median: 0 } },
pctThreshold: [ 90 ],
histogram: undefined,
statsd_metrics: { processing_time: 0 } };
*/

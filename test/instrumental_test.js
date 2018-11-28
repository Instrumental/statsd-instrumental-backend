var TestHelper = require("./test_helper");
var timekeeper = require('timekeeper');
var path = require("path");
var util = require("util");
var fs   = require("fs");

var test = TestHelper.test;
var setup = TestHelper.setup;
var sendMetric = TestHelper.sendMetric;
var checkForMetric = TestHelper.checkForMetric;

test('counter_rate should not report if disabled in configuration', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1': 280.5 }
  };

  now = Math.round(new Date().getTime() / 1000);
  dummy_events =  { on: function(e){ } };
  TestHelper.config.instrumental.recordCounterRates = true;
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  // Enable rate counters and ensure they are recorded
  payload = TestHelper.instrumental.build_payload(metrics);

  // TODO: What's with the fucking space on the end of this string?
   t.assert(payload.indexOf("gauge_absolute my.test.1.rate 280.5 ") > -1, "Expected a rate metric, got: " + JSON.stringify(payload))

  // Disable rate counters and ensure they are NOT recorded
  TestHelper.config.instrumental.recordCounterRates = false;
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);
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

  TestHelper.config.instrumental.metricPrefix = "testprefix";
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);

  t.assert(payload.indexOf("increment testprefix.my.test.1 2805 ") > -1, "Metric name was not prefixed properly (got " + JSON.stringify(payload) + ")");

  t.end();
});

test('metricPrefix ending with dots wont send double dots', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 }
  };

  now = Math.round(new Date().getTime() / 1000);
  dummy_events =  { on: function(e){ } };

  TestHelper.config.instrumental.metricPrefix = "testprefix.";
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);

  t.assert(payload.indexOf("increment testprefix.my.test.1 2805 ") > -1, "Metric name was not prefixed properly (got " + JSON.stringify(payload) + ")");

  t.end();
});

test("with default production debug confirguation no messages are logged on every metric send", function (t) {
  oldTime = Math.round(new Date().getTime() / 1000);

  // the default config value in production, though the default in test is true
  TestHelper.config.debug = false;

  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);
  sendMetric(metricName, oldTime, {skipInit: true});
  sendMetric(metricName, oldTime, {skipInit: true});
  sendMetric(metricName, oldTime, {skipInit: true});
  sendMetric(metricName, oldTime, {skipInit: true});
  sendMetric(metricName, oldTime, {skipInit: true});

  checkForMetric(metricName, {
    expectedSum: 6, // failures don't get sent
    found: function(){
      var cert_log_messages =
        TestHelper.log.filter(function(entry){return true});
      var expected_messages = [
        "Adding node default ssl cert option",
        "Found valid cert bundle: digicert_intermediate",
        "Found valid cert bundle: digicert_root",
        "Found valid cert bundle: rapidssl",
        "Adding known ssl bundles: digicert_intermediate digicert_root rapidssl",
        "Connecting to collector.instrumentalapp.com:8001",
        "Attempting new cert config: node default",
      ];
      t.deepEqual(cert_log_messages, expected_messages, "expected to use node default certs");
      t.pass();
      t.end();
    },
    timeout: function(){
      var cert_log_messages =
        TestHelper.log.filter(function(entry){return true});
      t.fail(JSON.stringify(cert_log_messages) + "\n\n");
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

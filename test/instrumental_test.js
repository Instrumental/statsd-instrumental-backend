var tape_test = require('tape');
var instrumental;
var originalConfig = require("../exampleConfig.js").config;
var https = require("https");
var EventEmitter = require('events');
var timekeeper = require('timekeeper');
var path = require("path");
var util = require("util");
var fs   = require("fs");

var timedOut = false;
var timer, config, log;

var test = function(name, testFunction){
  tape_test(name, function(t){
    // Clear any state in the backend
    delete require.cache[require.resolve('../lib/instrumental.js')]
    instrumental = require("../lib/instrumental.js");

    // Start with a fresh config based off the example with minor modifications
    config = JSON.parse(JSON.stringify(originalConfig));
    config.instrumental.key = process.env.INSTRUMENTAL_TEST_TOKEN;
    config.instrumental.recordCounterRates = false;
    config.instrumental.host = "collector.instrumentalapp.com";
    config.debug = true; // allow log verification
    config.instrumental.metricPrefix = "";
    config.instrumental.log = function(){
      // console.warn(util.format.apply(null, arguments));
      log.push(util.format.apply(null, arguments));
    };

    // Setup state to check for timeouts polling the API
    timedOut = false;
    if (timer) clearTimeout(timer);

    // Reset timekeeper so time behaves normally by default
    timekeeper.reset();

    // Collect log messages for checking in tests
    log = [];

    // Run the test
    testFunction(t);
  });
};

function sendMetric(metricName, time, options){
  if(typeof(options) === 'undefined') options = {};
  if (!options.skipInit) {
    dummy_events = new EventEmitter();
    instrumental.init(now, config, dummy_events)
  };
  metrics = {
    counters: {},
    counter_rates: {},
    timer_data: {},
    gauges: {},
    sets: {},
  };
  metrics.counters[metricName] = 1;
  dummy_events.emit("flush", time, metrics);
}

function checkForMetric(metricName, options) {
  var httpOptions = {
    hostname: 'instrumentalapp.com',
    path: '/api/2/metrics/'+metricName,
    headers: {
      'X-Instrumental-Token': process.env.INSTRUMENTAL_TEST_TOKEN,
    }
  };
  var req = https.get(httpOptions, function(res){
    // console.warn('statusCode:', res.statusCode);
    // console.warn('headers:', res.headers);
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      // console.warn(body);
      var data = JSON.parse(body).response.metrics[0].values.data;
      var last_point = data[data.length-1];
      var expectedSum = options.expectedSum || 1;
      if (last_point.s == expectedSum) {
        options.found();
      } else {
        if (timedOut) {
          options.timeout();
        } else {
          setTimeout(function(){checkForMetric(metricName, options)}, 1000);
        }
      }
    });
  });
  req.on('error', function(e){
    console.error(e.message);
    options.error();
  });
}

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

test("by default no messages are logged on every meetric send", function (t) {
  oldTime = Math.round(new Date().getTime() / 1000);

  // the default config value in production, though the default in test is true
  config.debug = false;

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
        log.filter(function(entry){return true});
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
        log.filter(function(entry){return true});
      t.fail(JSON.stringify(cert_log_messages) + "\n\n");
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

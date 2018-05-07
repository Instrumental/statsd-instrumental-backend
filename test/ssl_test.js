var tape_test = require('tape');
var instrumental;
var originalConfig = require("../exampleConfig.js").config;
var https = require("https");
var EventEmitter = require('events');
var timekeeper = require('timekeeper');
var path = require("path");

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

var instrumentalLatency = 20000;

function setup(t){
  t.timeoutAfter(instrumentalLatency*2.2); // needs to be more than Instrumental latency, a little more than the timeout below

  // Setup something to stop the checkForMetric loop so node exits.
  timer = setTimeout(function(){
    timedOut = true;
  }, instrumentalLatency*2);
  tape_test.onFinish(function(){
    clearTimeout(timer);
  });
}

function sendMetric(metricName, time, options){
  if(typeof(options) === 'undefined') options = {};
  if (!options.skipInit) {
    dummy_events = new EventEmitter();
    config.instrumental.metricPrefix = "";
    config.instrumental.log = function(){log.push(arguments)};
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

function checkForMetric(metricName, callbacks) {
  var options = {
    hostname: 'instrumentalapp.com',
    path: '/api/2/metrics/'+metricName,
    headers: {
      'X-Instrumental-Token': process.env.INSTRUMENTAL_TEST_TOKEN,
    }
  };
  var req = https.get(options, function(res){
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
      if (last_point.s == 1) {
        callbacks.found();
      } else {
        if (timedOut) {
          callbacks.timeout();
        } else {
          setTimeout(function(){checkForMetric(metricName, callbacks)}, 1000);
        }
      }
    });
  });
  req.on('error', function(e){
    console.error(e.message);
    callbacks.error();
  });
}


test('specifying a valid and working cert bundle works', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  config.instrumental.caCertFile = path.join(__dirname, "..", "certs", "instrumental.ca.pem");
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      t.pass();
      t.end();
    },
    timeout: function(){
      t.fail();
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

test('specifying a valid but not working cert bundle retries', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  config.instrumental.caCertFile = path.join(__dirname, "..", "certs", "instrumental.2018-08-19.ca.pem");
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);
  sendMetric(metricName, oldTime, {skipInit: true});

  var checkConnectionErrors = function() {
    var connection_errors =
      log.filter(function(entry){return JSON.stringify(entry).match(/UNABLE_TO_GET_ISSUER_CERT_LOCALLY/)});
    t.equal(connection_errors.length, 2, "expected 2 connection attemps, 1 retry");
    t.end();
  };
  setTimeout(checkConnectionErrors, 1000);
});

test('specifying an invalid cert bundle errors', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  config.instrumental.caCertFile = "non_existent_file";
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  t.throws(function(){
    sendMetric(metricName, oldTime);
  }, /no such file/, "expected error finding non_existent_file");
  t.end();
});

test('old agent works with new elb', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var time = new Date(Date.parse("2019-01-01"));
  timekeeper.travel(time); // Travel to that date.

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      t.pass();
      t.end();
    },
    timeout: function(){
      t.fail();
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

test('old agent connects to old elb', function(t) {
  setup(t);

  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, now);

  checkForMetric(metricName, {
    found: function(){
      t.pass();
      t.end();
    },
    timeout: function(){
      t.fail();
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

test('future agent correctly expires cert and errors with old elb', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var time = new Date(Date.parse("2019-01-01"));
  timekeeper.travel(time); // Travel to that date.

  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      t.fail();
      t.end();
    },
    timeout: function(){
      t.pass();
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

test('future agent correctly expires cert and works with new elb', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var time = new Date(Date.parse("2019-01-01"));
  timekeeper.travel(time); // Travel to that date.

  // config.instrumental.host = "smoke.collect.instrumentalapp.com";
  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      t.pass();
      t.end();
    },
    timeout: function(){
      t.fail();
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

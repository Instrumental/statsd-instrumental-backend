var tape_test = require('tape');
var originalConfig = require("../exampleConfig.js").config;
var https = require("https");
var EventEmitter = require('events').EventEmitter;
var timekeeper = require('timekeeper');
var path = require("path");
var util = require("util");
var fs   = require("fs");

var timedOut = false;
var timer;

exports.test = function(name, testFunction){
  tape_test(name, function(t){
    // Clear any state in the backend
    delete require.cache[require.resolve('../lib/instrumental.js')]
    exports.instrumental = require("../lib/instrumental.js");

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
    exports.config = config;

    // Setup state to check for timeouts polling the API
    timedOut = false;
    if (timer) clearTimeout(timer);

    // Reset timekeeper so time behaves normally by default
    timekeeper.reset();

    // Collect log messages for checking in tests
    log = [];
    exports.log = log;

    // Run the test
    testFunction(t);
  });
};

var instrumentalLatency = 20000;

exports.setup = function(t){
  t.timeoutAfter(instrumentalLatency*2.2); // needs to be more than Instrumental latency, a little more than the timeout below

  // Setup something to stop the checkForMetric loop so node exits.
  timer = setTimeout(function(){
    timedOut = true;
  }, instrumentalLatency*2);
  tape_test.onFinish(function(){
    clearTimeout(timer);
  });
}

exports.sendMetric = function(metricName, time, options){
  if(typeof(options) === 'undefined') options = {};
  if (!options.skipInit) {
    dummy_events = new EventEmitter();
    exports.instrumental.init(now, config, dummy_events)
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

exports.checkForMetric = function(metricName, options) {
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
          setTimeout(function(){exports.checkForMetric(metricName, options)}, 1000);
        }
      }
    });
  });
  req.on('error', function(e){
    console.error(e.message);
    options.error();
  });
}

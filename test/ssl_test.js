var tape_test = require('tape');
var instrumental;
var originalConfig = require("../exampleConfig.js").config;
var https = require("https");
var EventEmitter = require('events').EventEmitter;
var timekeeper = require('timekeeper');
var path = require("path");
var util = require("util");

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


test('specifying a valid and working cert bundle works', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  config.instrumental.caCertFile = path.join(__dirname, "..", "test", "fixtures", "instrumental.ca.pem");
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
  config.instrumental.caCertFile = path.join(__dirname, "..", "test", "fixtures", "instrumental.2018-08-19.ca.pem");
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);
  sendMetric(metricName, oldTime, {skipInit: true});
  var checkConnectionErrors = function() {
    var connection_errors =
      log.filter(function(entry){return entry.match(/Client error:/)});
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
  var metricName = "test.metric"+Math.random();
  t.throws(function(){
    sendMetric(metricName, oldTime);
  }, /no such file/, "expected error finding non_existent_file");
  t.end();
});

test('node default certs are used by default', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      var cert_log_messages =
        log.filter(function(entry){return entry.match(/Using certs/i)});
      t.deepEqual(cert_log_messages, ["Using certs: node default"], "expected to use node default certs");
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

test('fallback to newest cert bundle and stick if node default certs fail', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var metricName = "test.metric"+Math.random();

  config.instrumental.tlsVariationTimeout = 500;

  var timeBetweenSends = 1000;
  var actions = [];

  // node default certs
  actions.push(function(){
    config.instrumental.host = "smoke-collector.instrumentalapp.com";
    sendMetric(metricName, oldTime); // using node default certs
  });
  actions.push(function(){
    sendMetric(metricName, oldTime, {skipInit: true}); // using node default certs
  });

  // New cert bundle
  actions.push(function(){
    config.instrumental.port = 8000;
    sendMetric(metricName, oldTime); // node default certs fail
  });
  actions.push(function(){
    config.instrumental.port = 8001;
    sendMetric(metricName, oldTime); // bundle
  });
  actions.push(function(){
    sendMetric(metricName, oldTime, {skipInit: true}); // bundle
  });

  // Back to node default
  actions.push(function(){
    config.instrumental.port = 8000;
    sendMetric(metricName, oldTime); // bundle fails
  });
  actions.push(function(){
    config.instrumental.port = 8001;
    sendMetric(metricName, oldTime); // node default
  });
  actions.push(function(){
    sendMetric(metricName, oldTime, {skipInit: true}); // node default
  });

  actions.forEach(function(action, index){
    setTimeout(action, index*timeBetweenSends);
  });

  checkForMetric(metricName, {
    expectedSum: 6, // failures don't get sent
    found: function(){
      var cert_log_messages =
        log.filter(function(entry){return entry.match(/\bcert/i)});
      var expected_messages = [
        "Adding node default ssl cert option",
        'Found valid cert bundle: equifax.2018-08-19',
        'Found valid cert bundle: geotrust.2018-08-19',
        'Found valid cert bundle: rapidssl.2018-08-19',
        'Found valid cert bundle: digicert_intermediate',
        'Found valid cert bundle: digicert_root',
        'Found valid cert bundle: rapidssl',
        "Attempting new cert config: node default",
        "Using certs: node default", // 1
        "Using certs: node default", // 2
        "Using certs: node default", // fail
        "Attempting new cert config: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",

        // 3
        "Using certs: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",

        // 4
        "Using certs: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",

        // fail
        "Using certs: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",
        "Attempting new cert config: node default",
        "Using certs: node default", // 5
        "Using certs: node default"  // 6
      ];
      t.deepEqual(cert_log_messages, expected_messages, "expected to use node default certs");
      t.pass();
      t.end();
    },
    timeout: function(){
      var cert_log_messages =
        log.filter(function(entry){return entry.match(/Using certs/i)});
      t.fail(JSON.stringify(cert_log_messages) + "\n\n");
      t.end();
    },
    error: function(){
      t.fail();
      t.end();
    },
  });
});

test('old agent works with new elb', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var time = new Date(Date.parse("2019-01-01"));
  timekeeper.travel(time); // Travel to that date.

  config.instrumental.host = "smoke-collector.instrumentalapp.com";
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

  config.instrumental.disallowNodeDefaultCerts = true;
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      t.fail();
      t.end();
    },
    timeout: function(){
      var cert_log_messages =
        log.filter(function(entry){
          return entry.match(/\bcert/i) &&
            !entry.match(/Error: unable to get/i) &&
            !entry.match(/Error: CERT_UNTRUSTED/i) &&
            !entry.match(/Error: certificate not trusted/i);
        });
      var expected_messages = [
        "Skipping node default certificates",
        'Found valid cert bundle: digicert_intermediate',
        'Found valid cert bundle: digicert_root',
        'Found valid cert bundle: rapidssl',
        "Attempting new cert config: bundles digicert_intermediate digicert_root rapidssl",
        "Using certs: bundles digicert_intermediate digicert_root rapidssl",
      ];
      t.deepEqual(cert_log_messages, expected_messages, "expected to use node default certs");
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

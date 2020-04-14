var TestHelper = require("./test_helper");
var timekeeper = require('timekeeper');
var path = require("path");
var util = require("util");
var fs   = require("fs");

var test = TestHelper.test;
var setup = TestHelper.setup;
var sendMetric = TestHelper.sendMetric;
var checkForMetric = TestHelper.checkForMetric;

test('specifying a valid and working cert bundle works', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var certs = [];
  certs.push(path.join(__dirname, "..", "test", "fixtures", "current_production_intermediate_cert.pem"));

  TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
  TestHelper.config.instrumental.caCertFiles = certs;
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

  var certs = [];
  var certDir = path.join(__dirname, "..", "certs/");
  fs.readdirSync(certDir).forEach(function(filename) {
    if (filename.match(/ca\.pem$/) && filename.match(/20/)) {
      certs.push(certDir + filename);
    }
  });

  TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
  TestHelper.config.instrumental.caCertFiles = certs;
  now = Math.round(new Date().getTime() / 1000);
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);
  sendMetric(metricName, oldTime, {skipInit: true});
  var checkConnectionErrors = function() {
    var connection_errors =
      TestHelper.log.filter(function(entry){return entry.match(/Client error:/)});
    t.equal(connection_errors.length, 2, "expected 2 connection attemps, 1 retry");
    t.end();
  };
  setTimeout(checkConnectionErrors, 1000);
});

test('specifying an invalid cert bundle errors', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
  TestHelper.config.instrumental.caCertFiles = ["non_existent_file"];
  var metricName = "test.metric"+Math.random();
  t.throws(function(){
    sendMetric(metricName, oldTime);
  }, /no such file/, "expected error finding non_existent_file");
  t.end();
});

test('node default certs are used by default', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
  var metricName = "test.metric"+Math.random();
  sendMetric(metricName, oldTime);

  checkForMetric(metricName, {
    found: function(){
      var cert_log_messages =
        TestHelper.log.filter(function(entry){return entry.match(/Using certs/i)});
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

// Skipping this test for now since we rely on system certs. If we add new cert
// bundles then we should add this back in.
// test('before cert expiration, fallback to newest cert bundle and stick if node default certs fail', function(t) {
//   setup(t);
//
//   realCurrentTime = Math.round(new Date().getTime() / 1000);
//
//   var time = new Date(Date.parse("2018-01-01"));
//   timekeeper.travel(time); // Travel to that date.
//
//   var metricName = "test.metric"+Math.random();
//
//   TestHelper.config.instrumental.tlsVariationTimeout = 500;
//
//   var timeBetweenSends = 2000;
//   var actions = [];
//
//   // node default certs
//   actions.push(function(){
//     TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
//     sendMetric(metricName, realCurrentTime); // using node default certs
//   });
//   actions.push(function(){
//     sendMetric(metricName, realCurrentTime, {skipInit: true}); // using node default certs
//   });
//
//   // New cert bundle
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8000;
//     sendMetric(metricName, realCurrentTime); // node default certs fail
//   });
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8001;
//     sendMetric(metricName, realCurrentTime); // bundle
//   });
//   actions.push(function(){
//     sendMetric(metricName, realCurrentTime, {skipInit: true}); // bundle
//   });
//
//   // Back to node default
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8000;
//     sendMetric(metricName, realCurrentTime); // bundle fails
//   });
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8001;
//     sendMetric(metricName, realCurrentTime); // node default
//   });
//   actions.push(function(){
//     sendMetric(metricName, realCurrentTime, {skipInit: true}); // node default
//   });
//
//   actions.forEach(function(action, index){
//     setTimeout(action, index*timeBetweenSends);
//   });
//
//   checkForMetric(metricName, {
//     expectedSum: 6, // failures don't get sent
//     found: function(){
//       var cert_log_messages =
//         TestHelper.log.filter(function(entry){return entry.match(/\bcert/i)});
//       var expected_messages = [
//         "Adding node default ssl cert option",
//         'Found valid cert bundle: equifax.2018-08-19',
//         'Found valid cert bundle: geotrust.2018-08-19',
//         'Found valid cert bundle: rapidssl.2018-08-19',
//         'Found valid cert bundle: digicert_intermediate',
//         'Found valid cert bundle: digicert_root',
//         'Found valid cert bundle: rapidssl',
//         "Attempting new cert config: node default",
//         "Using certs: node default", // 1
//         "Using certs: node default", // 2
//         "Using certs: node default", // fail
//         "Attempting new cert config: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",
//
//         // 3
//         "Using certs: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",
//
//         // 4
//         "Using certs: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",
//
//         // fail
//         "Using certs: bundles equifax.2018-08-19 geotrust.2018-08-19 rapidssl.2018-08-19 digicert_intermediate digicert_root rapidssl",
//         "Attempting new cert config: node default",
//         "Using certs: node default", // 5
//         "Using certs: node default"  // 6
//       ];
//       t.deepEqual(cert_log_messages, expected_messages, "expected to use node default certs");
//       t.pass();
//       t.end();
//     },
//     timeout: function(){
//       var cert_log_messages =
//         TestHelper.log.filter(function(entry){return entry.match(/Using certs/i)});
//       t.fail(JSON.stringify(cert_log_messages) + "\n\n");
//       t.end();
//     },
//     error: function(){
//       t.fail();
//       t.end();
//     },
//   });
// });

// Skipping this test for now since we rely on system certs. If we add new cert
// bundles then we should add this back in.
// test('after cert expiration, fallback to newest cert bundle and stick if node default certs fail', function(t) {
//   setup(t);
//
//   realCurrentTime = Math.round(new Date().getTime() / 1000);
//
//   var time = new Date(Date.parse("2019-01-01"));
//   timekeeper.travel(time); // Travel to that date.
//
//
//   var metricName = "test.metric"+Math.random();
//
//   TestHelper.config.instrumental.tlsVariationTimeout = 500;
//
//   var timeBetweenSends = 2000;
//   var actions = [];
//
//   // node default certs
//   actions.push(function(){
//     TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
//     sendMetric(metricName, realCurrentTime); // using node default certs
//   });
//   actions.push(function(){
//     sendMetric(metricName, realCurrentTime, {skipInit: true}); // using node default certs
//   });
//
//   // New cert bundle
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8000;
//     sendMetric(metricName, realCurrentTime); // node default certs fail
//   });
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8001;
//     sendMetric(metricName, realCurrentTime); // bundle
//   });
//   actions.push(function(){
//     sendMetric(metricName, realCurrentTime, {skipInit: true}); // bundle
//   });
//
//   // Back to node default
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8000;
//     sendMetric(metricName, realCurrentTime); // bundle fails
//   });
//   actions.push(function(){
//     TestHelper.config.instrumental.port = 8001;
//     sendMetric(metricName, realCurrentTime); // node default
//   });
//   actions.push(function(){
//     sendMetric(metricName, realCurrentTime, {skipInit: true}); // node default
//   });
//
//   actions.forEach(function(action, index){
//     setTimeout(action, index*timeBetweenSends);
//   });
//
//   checkForMetric(metricName, {
//     expectedSum: 6, // failures don't get sent
//     found: function(){
//       var cert_log_messages =
//         TestHelper.log.filter(function(entry){return entry.match(/\bcert/i)});
//       var expected_messages = [
//         "Adding node default ssl cert option",
//         'Ignoring expired cert bundle: equifax.2018-08-19',
//         'Ignoring expired cert bundle: geotrust.2018-08-19',
//         'Ignoring expired cert bundle: rapidssl.2018-08-19',
//         'Ignoring expired cert bundle: equifax.2018-08-19',
//         'Ignoring expired cert bundle: geotrust.2018-08-19',
//         'Ignoring expired cert bundle: rapidssl.2018-08-19',
//         'Found valid cert bundle: digicert_intermediate',
//         'Found valid cert bundle: digicert_root',
//         'Found valid cert bundle: rapidssl',
//         "Attempting new cert config: node default",
//         "Using certs: node default", // 1
//         "Using certs: node default", // 2
//         "Using certs: node default", // fail
//         "Attempting new cert config: bundles digicert_intermediate digicert_root rapidssl",
//
//         // 3
//         "Using certs: bundles digicert_intermediate digicert_root rapidssl",
//
//         // 4
//         "Using certs: bundles digicert_intermediate digicert_root rapidssl",
//
//         // fail
//         "Using certs: bundles digicert_intermediate digicert_root rapidssl",
//         "Attempting new cert config: node default",
//         "Using certs: node default", // 5
//         "Using certs: node default"  // 6
//       ];
//       t.deepEqual(cert_log_messages, expected_messages, "expected to use node default certs");
//       t.pass();
//       t.end();
//     },
//     timeout: function(){
//       var cert_log_messages =
//         TestHelper.log.filter(function(entry){return entry.match(/Using certs/i)});
//       t.fail(JSON.stringify(cert_log_messages) + "\n\n");
//       t.end();
//     },
//     error: function(){
//       t.fail();
//       t.end();
//     },
//   });
// });

test('old agent works with new elb', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var time = new Date(Date.parse("2019-01-01"));
  timekeeper.travel(time); // Travel to that date.

  TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
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

// Now that we'e past the switch date the old ELB doesn't exist. If we need to
// do this switch again in the future we can use this test to verify behavior.
// test('old agent connects to old elb', function(t) {
//   setup(t);
//
//   realCurrentTime = Math.round(new Date().getTime() / 1000);
//
//   var time = new Date(Date.parse("2018-01-01"));
//   timekeeper.travel(time); // Travel to that date.
//
//   TestHelper.config.instrumental.host = "collector.instrumentalapp.com";
//   now = Math.round(new Date().getTime() / 1000);
//   var metricName = "test.metric"+Math.random();
//   sendMetric(metricName, realCurrentTime);
//
//   checkForMetric(metricName, {
//     found: function(){
//       t.pass();
//       t.end();
//     },
//     timeout: function(){
//       t.fail();
//       t.end();
//     },
//     error: function(){
//       t.fail();
//       t.end();
//     },
//   });
// });

// Now that we'e past the switch date the old ELB doesn't exist. If we need to
// do this switch again in the future we can use this test to verify behavior.
// test('future agent correctly expires cert and errors with old elb', function(t) {
//   setup(t);
//
//   oldTime = Math.round(new Date().getTime() / 1000);
//
//   var time = new Date(Date.parse("2019-01-01"));
//   timekeeper.travel(time); // Travel to that date.
//
//   TestHelper.config.instrumental.disallowNodeDefaultCerts = true;
//   TestHelper.config.instrumental.host = "old-elb.instrumentalapp.com";
//   now = Math.round(new Date().getTime() / 1000);
//   var metricName = "test.metric"+Math.random();
//   sendMetric(metricName, oldTime);
//
//   checkForMetric(metricName, {
//     found: function(){
//       t.fail("Future agent shouldn't work with the old ELB, logs: " + TestHelper.log);
//       t.end();
//     },
//     timeout: function(){
//       var cert_log_messages =
//         TestHelper.log.filter(function(entry){
//           return entry.match(/\bcert/i) &&
//             !entry.match(/Error: unable to get/i) &&
//             !entry.match(/Error: CERT_UNTRUSTED/i) &&
//             !entry.match(/Error: certificate not trusted/i);
//         });
//       var expected_messages = [
//         "Skipping node default certificates",
//         'Found valid cert bundle: digicert_intermediate',
//         'Found valid cert bundle: digicert_root',
//         'Found valid cert bundle: rapidssl',
//         "Attempting new cert config: bundles digicert_intermediate digicert_root rapidssl",
//         "Using certs: bundles digicert_intermediate digicert_root rapidssl",
//       ];
//       t.deepEqual(cert_log_messages, expected_messages, "expected to use node default certs");
//       t.pass();
//       t.end();
//     },
//     error: function(){
//       t.fail();
//       t.end();
//     },
//   });
// });

test('future agent correctly expires cert and works with new elb', function(t) {
  setup(t);

  oldTime = Math.round(new Date().getTime() / 1000);

  var time = new Date(Date.parse("2019-01-01"));
  timekeeper.travel(time); // Travel to that date.

  TestHelper.config.instrumental.host = "smoke-collector.instrumentalapp.com";
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

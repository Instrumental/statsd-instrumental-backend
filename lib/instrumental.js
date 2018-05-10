/*
 * Flushes stats to Instrumental (https://instrumentalapp.com).
 *
 * To enable this backend, include 'statsd-instrumental-backend' in the
 * backends configuration array:
 *
 *   backends: ['statsd-instrumental-backend']
 *
 * The backend will read the configuration options from the following
 * 'instrumental' hash defined in the main statsd config file:
 *
 *  instrumental : {
 *    key     : API Token for your application,
 *    host    : Instrumental server address (default: "collector.instrumentalapp.com")
 *    port    : Instrumental server port (default: 8001)
 *    timeout : Connection and read timeout (default: 10000 [10s])
 *  }
 */

// TODO: Log some internal stats (error rate, reconnect, metrics sent)

var net  = require("net"),
    util = require("util"),
    os = require("os"),
    dns = require("dns"),
    package = require('../package.json'),
    tls  = require("tls"),
    fs   = require("fs"),
    path = require("path"),
    buffering_aggregation = require("./instrumental/buffering_aggregation"),
    p    = require("./instrumental/protocol");

var debug;
var error = false;
var hostname = os.hostname();
var caChainPath = path.join("..", "certs");
var knownCerts  = [
  "equifax.2018-08-19", "geotrust.2018-08-19", "rapidssl.2018-08-19",
  "digicert_intermediate", "digicert_root", "rapidssl"
];
var exports = module.exports = {}; // for testing
var key, host, port, timeout, flushInterval, secure, verifyCert, caChain,
  recordCounterRates, metricPrefix, metricFiltersInclude, metricFiltersExclude,
  tlsOptionsVariations, tlsVariationTimeout;
var formatMetricName = function(metric){ return metric; }
var keepMetric = function(metric){ return true; }

var instrumentalStats = {};

var log = function() {
  console.log.apply(null, arguments);
  if (debug) console.warn.apply(null, arguments);
}

function build_payload(metrics, time_stamp) {
  var payload = [];
  // Iterators: key and value.
  var k, v, name, vps;

  // increment item.count 200 121820381
  for(k in metrics.counters) {
    name = formatMetricName(k);
    v = metrics.counters[k];

    // Skip any counters that would not change the value
    if(v !== 0) {
      payload.push(p.inc(name, v, time_stamp));
    }

    if(recordCounterRates) {
      vps = metrics.counter_rates[k];
      payload.push(p.gauge_abs([name, "rate"].join("."), vps, time_stamp));
    }
  }

  // gauge item.time 7292 121820381
  for(k in metrics.timer_data){
    name = formatMetricName(k);
    for (var timer_data_key in metrics.timer_data[k]) {
      if (typeof(metrics.timer_data[k][timer_data_key]) === 'number') {
        payload.push(p.gauge_abs([name, timer_data_key].join("."), metrics.timer_data[k][timer_data_key], time_stamp));
      } else {
        for (var timer_data_sub_key in metrics.timer_data[k][timer_data_key]) {
          v = metrics.timer_data[k][timer_data_key][timer_data_sub_key];
          if(timer_data_sub_key.indexOf("bin") == 0){
            // This is histogram data, just increment the known server values
            payload.push(p.inc([name, timer_data_sub_key].join("."), v, time_stamp));
          } else {
            payload.push(p.gauge_abs([name, timer_data_sub_key].join("."), v, time_stamp));
          }

        }
      }
    }
  }

  // gauge item.gauge 7292 121820381
  for(k in metrics.gauges) {
    name = formatMetricName(k);
    payload.push(p.gauge(name, metrics.gauges[k], time_stamp));
  }

  // sets are strange and may not work correctly, but also, difficult to test.
  for(k in metrics.sets) {
    name = formatMetricName(k);
    payload.push(p.gauge_abs(name, metrics.sets[k].length, time_stamp));
  }

  payload = payload.filter(keepMetric);

  // By this point in time we should have an array of commands to send to the
  // instrumental server. We'll convert that array into a string blob in the
  // appropriate protocol.
  return payload;
}
exports.build_payload = build_payload;

function instrumental_connection(host, port, tlsOptionsVariation, onConnectCb){
  var connection;
  log("Connecting to " + host + ":" + port)
  if (secure){
    if (debug) log("Using certs: " + tlsOptionsVariation.name);
    connection = tls.connect(port, host, tlsOptionsVariation.options, function(){
      if(verifyCert && !connection.authorized){
        throw new Exception("Instrumental connection cannot be encrypted, certificate not secured");
      }
      onConnectCb(connection);
    });
  } else {
    connection = net.createConnection(port, host);
    connection.on("connect", function(){
      onConnectCb(connection);
    });
  }
  // All communication with the server is done in ASCII.
  connection.setEncoding("ascii");
  return connection;
}

function shouldTryTlsOptionsVariation(variation) {
  var lastAttemptedSucceeded =
    variation.lastSuccessAt > variation.lastAttemptedAt;
  var lastAttemptedHasntFailedYet =
    (variation.lastAttemptedAt - variation.lastSuccessAt) < tlsVariationTimeout;
  return lastAttemptedSucceeded || lastAttemptedHasntFailedYet;
}

function selectTlsOptionsVariation() {
  // Find the first variation that looks successful, if one does
  var successfulVariation = tlsOptionsVariations.filter(function(variation){
    if ( shouldTryTlsOptionsVariation(variation) ) {
      variation.lastAttemptedAt = new Date();
      if (debug) log("Sticking with tls variation: ", variation);
      return true;
    }
  });
  if (successfulVariation[0]) { return successfulVariation[0]; };

  // Sort oldest attempt first, that'll be what we try next. Oldest so that we
  // eventually rotate through them all instead of flipping between two.
  tlsOptionsVariations.sort(function(a, b){
    // return (a.lastSuccessAt || 0) - (b.lastSuccessAt || 0);
    return a.lastAttemptedAt - b.lastAttemptedAt;
  });

  var nextVariation = tlsOptionsVariations[0];
  log("Attempting new cert config: " + nextVariation.name);
  if (debug) log({tlsOptionsVariations: tlsOptionsVariations, tlsVariationTimeout: tlsVariationTimeout});

  // This is the first time we've tried this in a while so assume success
  // for the time being.
  nextVariation.lastAttemptedAt = new Date();
  nextVariation.lastSuccessAt = new Date();
  return nextVariation;
}

// Push data to instrumental
function instrumental_send(payload) {
  var state = "cold";
  var tlsOptionsVariation = selectTlsOptionsVariation();

  var client = instrumental_connection(host, port, tlsOptionsVariation, function(_client){
    state = "connected";

    var cleanString = function(value) {
      return String(value).replace(/\s+/g, "_");
    }

    // Write the authentication header
    _client.write(
      "hello version node/statsd-instrumental-backend/" + cleanString(package.version) +
        " hostname " + cleanString(hostname) +
        " pid " + cleanString(process.pid) +
        " runtime " + cleanString("node/" + process.versions.node) +
        " platform " + cleanString(process.platform + "-" + process.arch) + "\n" +
      "authenticate " + key + "\n"
    );
  });

  // We need to handle the timeout. I think we should only care about read
  // timeouts. That is we write out data, if we don't hear back in timeout
  // seconds then the data probably hasn't reached the server.
  client.setTimeout(timeout, function() {
    // ZOMG FAILED WRITING WE ARE BAD AT COMPUTER SCIENCE
    if(state == "connected") {
      // We're waiting to hear back from the server and it has timed out. It's
      // unlikely that the server will suddenly wake up and send us our data so
      // lets disconnect and go shopping.
      client.end();
    }
  });

  // HOW WE HANDLE ERRORS. We should probably reconnect, maybe retry.
  client.addListener("error", function(exception){
    if(debug) {
      log("Client error:", exception);
    }
    instrumentalStats.last_exception = Math.round(new Date().getTime() / 1000);
  });

  // What do we do when instrumental talks to us
  var totalBuffer = "";
  client.on("data", function(buffer) {
    totalBuffer = totalBuffer + buffer;

    if(debug) {
      log("Received:", buffer);
    }

    // Authorization success
    if(totalBuffer == "ok\nok\n") {
      error = false;

      if(debug) {
        log("Sending:", payload.join("\n"));
      }

      client.end(payload.join("\n") + "\n", function() {
        tlsOptionsVariation.lastSuccessAt = new Date();
        if (debug) log("payload sent, tlsOptionsVariation: ", tlsOptionsVariation);
        state = "sent";
      });

      instrumentalStats.last_flush = Math.round(new Date().getTime() / 1000);

    // Authorization failure
    } else if(totalBuffer.length >= "ok\nok\n".length) {
      // TODO: Actually do something with this
      error = true;

      instrumentalStats.last_exception = Math.round(new Date().getTime() / 1000);
    }
  });
}

function instrumental_flush(time_stamp, metrics) {
  if(flushInterval < 60000){
    metrics = buffering_aggregation(metrics, time_stamp, flushInterval);
  }
  var payload = build_payload(metrics, time_stamp);

  // Right now payload is at a minimum "\n"
  if(payload.length > 0) {
    instrumental_send(payload);
  }
}

function instrumental_status(writeCb) {
  for (stat in instrumentalStats) {
    writeCb(null, 'instrumental', stat, instrumentalStats[stat]);
  }
  writeCb(null, 'instrumental', 'error', error ? 1 : 0);
}

function knownValidCertNames() {
  var certNames = [];
  knownCerts.forEach(function(certName){
    var certExpiration = certName.split(".")[1];
    certExpiration = certExpiration && new Date(Date.parse(certExpiration));
    if ( ! certExpiration || (new Date() < certExpiration) ){
      certNames.push(certName);
    }
  });
  return certNames;
}

function knownValidCertPaths() {
  var certDir = path.join(__dirname, caChainPath);
  var caPaths = [];
  knownValidCertNames().forEach(function(certName){
    log("Found valid cert bundle: " + certName);
    var certPath = path.join(certDir, certName + ".ca.pem");
    caPaths.push(certPath);
  });
  return caPaths;
}

function certsFromPaths(paths) {
  var certs = [];
  paths.forEach(function(certPath){
    certs.push(fs.readFileSync(certPath));
  });
  return certs;
}

function initTlsOptionsVariations(config) {
  if (tlsOptionsVariations) { return tlsOptionsVariations; };

  var variations = [];

  if(typeof(config.instrumental.caCertFiles) === 'undefined'){
    // Node default certs
    if (config.instrumental.disallowNodeDefaultCerts) {
      log("Skipping node default certificates");
    } else {
      log("Adding node default ssl cert option");
      variations.push({ name: "node default", options: { rejectUnauthorized: verifyCert } });
    }

    // Cert bundles
    var certNames = knownValidCertNames();
    var certs = certsFromPaths(knownValidCertPaths());
    log("Adding known ssl bundles: " + certNames.join(" "));
    variations.push({ name: "bundles " + certNames.join(" "), options: { rejectUnauthorized: verifyCert, ca: certs } });
  } else {
    // User supplied, only use this
    config.instrumental.caCertFiles.forEach(function(certFile){
      log("Adding user supplied caCertFile option: " + certFile);
    });
    var certs = certsFromPaths(config.instrumental.caCertFiles);
    variations.push({ name: "user supplied", options: { rejectUnauthorized: verifyCert, ca: certs } });
  }

  tlsVariationTimeout = config.instrumental.tlsVariationTimeout || 10000;

  // Set the lastAttemptedAt to now so it's a comparable time. Set lastSuccessAt
  // in the order we would like these to be tried (used in sorting in
  // selectTlsOptionsVariation).
  variations.forEach(function(variation, index){
    // These should differ by more than tlsVariationTimeout so their initial
    // state is "failed" for the purposes of selectTlsOptionsVariation in order
    // to make the selection process more predictable.

    // A time in the order we want
    variation.lastAttemptedAt = new Date(index);

    // A time more than "failure" time before that
    variation.lastSuccessAt = new Date(index - tlsVariationTimeout*2);
  });

  tlsOptionsVariations = variations;
}

exports.init = function instrumental_init(startup_time, config, events) {
  debug = config.debug;

  if(config.instrumental) {
    if(typeof(config.instrumental.log) !== 'undefined'){
      log = config.instrumental.log;
    }

    key  = config.instrumental.key;
    host = config.instrumental.host || "collector.instrumentalapp.com";

    // Default 10s timeout
    timeout = Number(config.instrumental.timeout || 10000);

    // Record counter_rates by default
    if(typeof(config.instrumental.recordCounterRates) === 'undefined'){
      recordCounterRates = true;
    } else {
      recordCounterRates = config.instrumental.recordCounterRates;
    }

    // do no filtering by default
    if(typeof(config.instrumental.metricFiltersExclude) === 'undefined'){
      metricFiltersExclude = [];
    } else {
      metricFiltersExclude = config.instrumental.metricFiltersExclude;
    }

    // do no filtering by default
    if(typeof(config.instrumental.metricFiltersInclude) === 'undefined'){
      metricFiltersInclude = [];
    } else {
      metricFiltersInclude = config.instrumental.metricFiltersInclude;
    }
    keepMetric = function(metric){
      metricName = metric.split(" ")[1];
      return (!metricFiltersExclude.some(function(filter) { return metricName.match(filter); }) &&
              (metricFiltersInclude.length == 0 || metricFiltersInclude.some(function(filter) { return metricName.match(filter); })));
    };

    if(typeof(config.instrumental.metricPrefix) !== 'undefined' &&
       config.instrumental.metricPrefix != "" &&
       config.instrumental.metricPrefix != "."){
      var joinCharacter = ".";

      if(config.instrumental.metricPrefix.match(/\.$/))
      {
        joinCharacter = "";
      }

      formatMetricName = function(metric) {
        return [config.instrumental.metricPrefix, metric].join(joinCharacter);
      }
      metricPrefix = config.instrumental.metricPrefix;
    }

    if(typeof(config.instrumental.secure) === 'undefined'){
      secure = true;
    } else {
      secure = config.instrumental.secure;
    }

    // necessary while we transition config from verify_cert to verifyCert.
    if(typeof(config.instrumental.verifyCert) === 'undefined'){
      if(typeof(config.instrumental.verify_cert) === 'undefined'){
        verifyCert = true;
      } else {
        verifyCert = config.instrumental.verify_cert;
      }
    } else {
      verifyCert = config.instrumental.verifyCert;
    }
    if(secure && verifyCert){
      // Preserve previous setting for testing purposes
      initTlsOptionsVariations(config);
    }

    var defaultPort = secure ? 8001 : 8000;

    port = Number(config.instrumental.port || defaultPort);
  }

  flushInterval = config.flushInterval;

  // Check for credentials
  if(!key) {
    log("Missing instrumental.key from the config.");
    return false;
  }

  instrumentalStats.last_flush = startup_time;
  instrumentalStats.last_exception = startup_time;

  events.on("flush", instrumental_flush);
  events.on("status", instrumental_status);
  dns.resolve(hostname, function(err, ips) {
    if (!err) {
      dns.reverse(ips[0], function (err, domains) {
        if (!err && String(domains[0]).length > 0) {
          hostname = domains[0];
        }
      });
    }
  });

  return true;
};

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
var knownCerts  = ["equifax", "geotrust", "rapidssl"];
var exports = module.exports = {}; // for testing
var key, host, port, timeout, flushInterval, secure, verifyCert, caChain, recordCounterRates;

var instrumentalStats = {};

exports.build_payload = function build_payload(metrics, time_stamp) {
  var payload = [];
  // Iterators: key and value.
  var k, v;

  // increment item.count 200 121820381
  for(k in metrics.counters) {
    v = metrics.counters[k];

    // Skip any counters that would not change the value
    if(v !== 0) {
      payload.push(p.inc(k, v, time_stamp));
    }

    if(recordCounterRates) {
      var vps = metrics.counter_rates[k];
      payload.push(p.gauge_abs([k, "rate"].join("."), vps, time_stamp));
    }
  }

  // gauge item.time 7292 121820381
  for(k in metrics.timer_data){
    for (var timer_data_key in metrics.timer_data[k]) {
      if (typeof(metrics.timer_data[k][timer_data_key]) === 'number') {
        payload.push(p.gauge_abs([k, timer_data_key].join("."), metrics.timer_data[k][timer_data_key], time_stamp));
      } else {
        for (var timer_data_sub_key in metrics.timer_data[k][timer_data_key]) {
          v = metrics.timer_data[k][timer_data_key][timer_data_sub_key];
          if(timer_data_sub_key.indexOf("bin") == 0){
            // This is histogram data, just increment the known server values
            payload.push(p.inc([k, timer_data_sub_key].join("."), v, time_stamp));
          } else {
            payload.push(p.gauge_abs([k, timer_data_sub_key].join("."), v, time_stamp));
          }

        }
      }
    }
  }

  // gauge item.gauge 7292 121820381
  for(k in metrics.gauges) {
    payload.push(p.gauge(k, metrics.gauges[k], time_stamp));
  }

  for(k in metrics.sets) {
    payload.push(p.gauge_abs(k, metrics.sets[k].values().length, time_stamp));
  }

  // By this point in time we should have an array of commands to send to the
  // instrumental server. We'll convert that array into a string blob in the
  // appropriate protocol.
  return payload;
}

function instrumental_connection(host, port, onConnectCb){
  var connection;
  if (secure){
    connection = tls.connect(port, host, { rejectUnauthorized: verifyCert, ca: caChain }, function(){
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

// Push data to instrumental
function instrumental_send(payload) {
  var state = "cold";

  var client = instrumental_connection(host, port, function(_client){
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
      util.log(exception);
    }
    instrumentalStats.last_exception = Math.round(new Date().getTime() / 1000);
  });

  // What do we do when instrumental talks to us
  var totalBuffer = "";
  client.on("data", function(buffer) {
    totalBuffer = totalBuffer + buffer;

    if(debug) {
      util.puts("Received:", buffer);
    }

    // Authorization success
    if(totalBuffer == "ok\nok\n") {
      error = false;

      if(debug) {
        util.puts("Sending:", payload.join("\n"));
      }

      client.end(payload.join("\n") + "\n", function() {
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

exports.init = function instrumental_init(startup_time, config, events) {
  debug = config.debug;

  if(config.instrumental) {
    key  = config.instrumental.key;
    host = config.instrumental.host || "collector.instrumentalapp.com";

    // Default 10s timeout
    timeout = Number(config.instrumental.timeout || 10000);

    // Record counter_rates by default
    if(typeof(config.instrumental.recordCounterRates) == 'undefined'){
      recordCounterRates = true;
    } else {
      recordCounterRates = config.instrumental.recordCounterRates;
    }

    if(typeof(config.instrumental.secure) == 'undefined'){
      secure = true;
    } else {
      secure = config.instrumental.secure;
    }
    if(typeof(config.instrumental.verify_cert) == 'undefined'){
      verifyCert = true;
    } else {
      verifyCert = config.instrumental.verify_cert;
    }
    if(secure && verifyCert){
      var certDir = path.join(__dirname, caChainPath);
      caChain = [];
      knownCerts.forEach(function(certName){
        var certPath = path.join(certDir, certName + ".ca.pem");
        caChain.push(fs.readFileSync(certPath));
      });
    }

    var defaultPort = secure ? 8001 : 8000;

    port = Number(config.instrumental.port || defaultPort);
  }

  flushInterval = config.flushInterval;

  // Check for credentials
  if(!key) {
    util.log("Missing instrumental.key from the config.");
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

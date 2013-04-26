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
 *    key : API Token for your application,
 *    host : Instrumental server address (default: "collector.instrumentalapp.com")
 *    port : Instrumental server port (default: 8000)
 *    timeout : Connection and read timeout (default: 10000 [10s])
 *  }
 */

// TODO: Log some internal stats (error rate, reconnect, metrics sent)

var net  = require("net"),
    util = require("util"),
    buffering_aggregation = require("./instrumental/buffering_aggregation"),
    p = require("./instrumental/protocol");

var debug;
var error = false;

var key, host, port, timeout, flushInterval;

var instrumentalStats = {};

function build_payload(metrics, time_stamp) {
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

    var vps = metrics.counter_rates[k];
    payload.push(p.gauge_abs([k, "rate"].join("."), vps, time_stamp));
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

// Push data to instrumental
function instrumental_send(payload) {
  var state = "cold";

  var client = net.createConnection({ port: port, host: host });

  // All communication with the server is done in ASCII.
  client.setEncoding("ascii");

  client.on("connect", function() {
    // Connetion Established. Lets go shopping
    state = "connected";

    // Write the authentication header
    client.write(
      "hello version 1.0\n" +
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
  //
  // You know, we're early in the development cycle. We will (at most) expect
  // to receive "ok\nok\n" back from the server (ACK our header). Such a small
  // amount of data shouldn't be split into multiple packets... though I guess
  // we will find out.
  client.on("data", function(buffer) {
    if(debug) {
      util.puts("Received:", buffer);
    }

    // Authorization success
    if(buffer == "ok\nok\n") {
      error = false;

      if(debug) {
        util.puts("Sending:", payload.join("\n"));
      }

      client.end(payload.join("\n") + "\n", function() {
        state = "sent";
      });

      instrumentalStats.last_flush = Math.round(new Date().getTime() / 1000);

    // Authorization failure
    } else if(buffer == "ok\nfail\n") {
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
    port = Number(config.instrumental.port || 8000);

    // Default 10s timeout
    timeout = Number(config.instrumental.timeout || 10000);
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

  return true;
};

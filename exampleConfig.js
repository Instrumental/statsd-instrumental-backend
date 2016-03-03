/*
Example StatsD configuration for sending metrics to Instrumental.
See the offical Statsd exampleConfig.js for more StatsD options.
*/
{
 port: 8125
, backends: ["statsd-instrumental-backend" ]
, debug: false
, instrumental: {
    key: "INSTRUMENTAL_API_KEY", // REQUIRED
    secure: true, // OPTIONAL (boolean), whether or not to use secure protocol to connect to Instrumental, default true
    verify_cert: true, // OPTIONAL (boolean), should we attempt to verify the server certificate before allowing communication, default true
    timeout: 10000, // OPTIONAL (integer), number of milliseconds to wait for establishing a connection to Instrumental before giving up, default 10s
  }
}

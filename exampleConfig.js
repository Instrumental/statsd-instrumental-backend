/*
Example StatsD configuration for sending metrics to Instrumental.
See the offical Statsd exampleConfig.js for more StatsD options.
*/
exports.config = {
  port: 8125,
  backends: ["statsd-instrumental-backend"],
  debug: false,
  instrumental: {
    key: "PROJECT_API_TOKEN", // REQUIRED
    secure: true, // OPTIONAL (boolean), whether or not to use secure protocol to connect to Instrumental, default true
    verifyCert: true, // OPTIONAL (boolean), should we attempt to verify the server certificate before allowing communication, default true
    timeout: 10000, // OPTIONAL (integer), number of milliseconds to wait for establishing a connection to Instrumental before giving up, default 10s
    recordCounterRates: true, // OPTIONAL (boolean) whether or not to send ".rate" metrics with counters, default true
    metricPrefix: "", // OPTIONAL (string) this will be prepended (with a dot) to ALL of your metrics
    metricFilters: [] //OPTIONAL (array of regex) any metrics matching these filters will be dropped
  }
}

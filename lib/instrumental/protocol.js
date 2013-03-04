function server_msg(cmd, metric, value, time_stamp){
  return [cmd, metric, value, time_stamp].join(" ");
}

function inc(metric, value, time_stamp){
  return server_msg("increment", metric, value, time_stamp);
}

function gauge(metric, value, time_stamp){
  return server_msg("gauge", metric, value, time_stamp);
}

function gauge_abs(metric, value, time_stamp){
  return server_msg("gauge-absolute", metric, value, time_stamp);
}

module.exports = {
  inc: inc,
  gauge: gauge,
  gauge_abs: gauge_abs
};
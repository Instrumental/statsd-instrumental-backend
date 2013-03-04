var extend = require('util')._extend;

var bufferedAggregates = {};

function buffer_for_minute(metrics, time_stamp){
  var thisMinute = time_stamp - (time_stamp % 60);
  if(thisMinute != bufferedAggregates._lastMinute){
    bufferedAggregates = {
      counters : {},
      timers : {},
      sets : {},
      timer_counters : {},
      _lastMinute : thisMinute
    };
  }
  var k, previousValue;
  for(k in metrics.counters){
    previousValue = bufferedAggregates.counters[k] || 0;
    bufferedAggregates.counters[k] = previousValue + metrics.counters[k];
  }
  for(k in metrics.timers){
    previousValue = bufferedAggregates.timers[k] || [];
    bufferedAggregates.timers[k] = previousValue.concat(metrics.timers[k]);
  }
  for(k in metrics.timer_counters){
    previousValue = bufferedAggregates.timer_counters[k] || 0;
    bufferedAggregates.timer_counters[k] = previousValue + metrics.timer_counters[k];
  }
  for(k in metrics.sets){
    previousValue = bufferedAggregates.sets[k] || null;
    if(!previousValue){
      bufferedAggregates.sets[k] = metrics.sets[k];
    } else {
      if(metrics.sets[k].store){
        // Note that this is an implementation reliant
        // method of appending sets.  Should the implementation
        // change, this may need to be adjusted.
        for(var itm in metrics.sets[k].store){
          bufferedAggregates.sets[k].insert(itm);
        }
      }

    }
  }
  metrics.counters = bufferedAggregates.counters;
  metrics.timers = bufferedAggregates.timers;
  metrics.sets = bufferedAggregates.sets;
  metrics.timer_counters = bufferedAggregates.timer_counters;
  return metrics;
}

function reaggregate(metrics, time_stamp, flushInterval){
  // Much of this is taken from process_metrics.js in the
  // official Statsd implementation. Alterations merely
  // to correct for assumption that capture intervals
  // happen at 60s, as opposed to flushIntervalms.
  var k, v, i;
  var counter_rates = metrics.counter_rates || {},
      timer_data = metrics.timer_data || {},
      timer_counters = metrics.timer_counters || {};
  var counters = metrics.counters,
      timers = metrics.timers;
  var pctThreshold = metrics.pctThreshold;

  // console.log("TImer counters are ", timer_counters);

  for(k in counters){
    v = counters[k];
    counter_rates[k] = v / 60;
  }
  for(k in timers){
    if(timers[k].length > 0){
      var current_timer_data = timer_data[k] || {};

      var values = timers[k].sort(function(a,b){ return a-b; });
      var count = values.length;
      var min = values[0];
      var max = values[count - 1];

      var cumulativeValues = [min];
      for (i = 1; i < count; i++) {
        cumulativeValues.push(values[i] + cumulativeValues[i-1]);
      }

      var sum = min;
      var mean = min;
      var maxAtThreshold = max;

      var key2;

      for (key2 in pctThreshold) {
        var pct = pctThreshold[key2];
        if (count > 1) {
          var numInThreshold = Math.round(pct / 100 * count);

          maxAtThreshold = values[numInThreshold - 1];
          sum = cumulativeValues[numInThreshold - 1];
          mean = sum / numInThreshold;
        }

        var clean_pct = '' + pct;
        clean_pct = clean_pct.replace('.', '_');
        current_timer_data["mean_" + clean_pct] = mean;
        current_timer_data["upper_" + clean_pct] = maxAtThreshold;
        current_timer_data["sum_" + clean_pct] = sum;
      }

      sum = cumulativeValues[count-1];
      mean = sum / count;

      var sumOfDiffs = 0;
      for (i = 0; i < count; i++) {
        sumOfDiffs += (values[i] - mean) * (values[i] - mean);
      }

      var stddev = Math.sqrt(sumOfDiffs / count);
      current_timer_data["std"] = stddev;
      current_timer_data["upper"] = max;
      current_timer_data["lower"] = min;
      current_timer_data["count"] = timer_counters[k];
      current_timer_data["count_ps"] = timer_counters[k] / 60;
      current_timer_data["sum"] = sum;
      current_timer_data["mean"] = mean;

      timer_data[k] = current_timer_data;
    }
  }

  metrics.counter_rates = counter_rates;
  metrics.timer_data = timer_data;
  return metrics;
}

function perform_buffering_aggregation(original_metrics, time_stamp, flushInterval) {
  var metrics = buffer_for_minute(extend({}, original_metrics), time_stamp);
  metrics = reaggregate(metrics, time_stamp, flushInterval);
  return metrics;
}

module.exports = perform_buffering_aggregation;
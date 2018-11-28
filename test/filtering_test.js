var TestHelper = require("./test_helper");
var timekeeper = require('timekeeper');
var path = require("path");
var util = require("util");
var fs   = require("fs");

var test = TestHelper.test;
var setup = TestHelper.setup;
var sendMetric = TestHelper.sendMetric;
var checkForMetric = TestHelper.checkForMetric;

test('no filtering is done if minimal config specified', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1.rate': 280.5 },
    gauges: { 'my.gauge.1': 100 },
    sets: { 'my.set.1': ['1','2','3'] }
  };

  minimalConfig =  {
    port: 8125,
    backends: ["statsd-instrumental-backend"],
    debug: false,
    instrumental: {
      key: "PROJECT_API_TOKEN"
    }
  }

  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };
  TestHelper.instrumental.init(now, minimalConfig, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);

  t.assert(payload.length === 4);

  t.pass();
  t.end();
});

test('no filtering is done if empty config specified', function (t) {
  metrics = {
    counters: { 'my.test.1': 2805 },
    counter_rates: { 'my.test.1.rate': 280.5 },
    gauges: { 'my.gauge.1': 100 },
    sets: { 'my.set.1': ['1','2','3'] }
  };

  TestHelper.config.instrumental.recordCounterRates = true;
  TestHelper.config.instrumental.metricFiltersExclude = [];
  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);
  t.assert(payload.length === 4);

  t.pass();
  t.end();
});

test('regex filters work as expected, exclude only', function (t) {
  metrics = {
    counters: { 'filter.start.expression': 100,
                'filter.middle.expression': 100 },
    counter_rates: { 'filter.start.expression.rate': 10,
                     'filter.middle.expression.rate': 10},
    gauges: { 'end.expression.false.positive': 100,
              'true.positive.filter.end': 100 },
    sets: { 'false.positive.filter.start': ['1','2','3'] }
  };

  TestHelper.config.instrumental.metricFiltersExclude = [/^filter.start.*/, /.*filter.end$/, /\.middle\./];
  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);
  t.assert(payload.length === 2);

  t.pass();
  t.end();
});

test('regex filters work as expected, include only', function (t) {
  metrics = {
    counters: { 'has.some.dots': 100 },
    counter_rates: { 'has.some.dots.rate': 10 },
    gauges: { 'has_no_dots': 100,
              'is_special_but_has_no_dots': 10 },
    sets: { 'this.set.has.dots': ['1','2','3'] }
  };

  TestHelper.config.instrumental.recordCounterRates = true;
  TestHelper.config.instrumental.metricFiltersExclude = [];
  TestHelper.config.instrumental.metricFiltersInclude = [/\./, /special/];

  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);
  payload = TestHelper.instrumental.build_payload(metrics);

  t.assert(payload.length === 4);
  payload.map(function(item){
    t.assert(item.split(' ')[1] !== 'has_no_dots')
  })

  t.pass();
  t.end();
});

test('regex filters work as expected, include and exclude', function (t) {
  metrics = {
    counters: { 'filter.start.expression': 100,
                'filter.middle.expression': 100 },
    counter_rates: { 'filter.start.expression.rate': 10,
                     'filter.middle.expression.rate': 10},
    gauges: { 'end.expression.false.positive': 100,
              'true.positive.filter.end': 100,
              'has_no_dots': 100 },
    sets: { 'false.positive.filter.start': ['1','2','3'] }
  };

  TestHelper.config.instrumental.metricFiltersExclude = [/^filter.start.*/, /.*filter.end$/, /\.middle\./];
  TestHelper.config.instrumental.metricFiltersInclude = [/\./];
  var now = Math.round(new Date().getTime() / 1000);
  var dummy_events =  { on: function(e){ } };
  TestHelper.instrumental.init(now, TestHelper.config, dummy_events);

  payload = TestHelper.instrumental.build_payload(metrics);
  t.assert(payload.length === 2);

  t.pass();
  t.end();
});

'use strict';

var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var util = require('../util');
var ad = require('../ad');
var dists = require('../dists');

var StreamingAggregator = function(path) {
  this.max = {value: undefined, score: -Infinity};
  this.handle = fs.openSync(path, 'ax');
  this.count = 0;
  this.append('[');
};

StreamingAggregator.prototype.append = function(data) {
  fs.appendFileSync(this.handle, data);
};

StreamingAggregator.prototype.add = function(value, score) {
  assert.ok(score !== undefined, 'A score is required to compute the MAP.');
  if (this.count > 0) {
    this.append(',');
  }
  var sLst = _.toPairs(value);
  for (var i = 0; i < sLst.length; i++) {
    var prams = sLst[i][0].split(',');
    var val = sLst[i][1]
    this.append(JSON.stringify({
      type: prams[0],
      param: prams[1],
      property: prams[2],
      category: prams[3],
      val: val
    }));
    if (i < sLst.length - 1) { this.append(','); }
  };
  // this.append(
  //   JSON.stringify(value)
  //   // JSON.stringify({value: value, score: score})
  // );
  if (score > this.max.score) {
    this.max.value = value;
    this.max.score = score;
  }
  this.count += 1;
};

StreamingAggregator.prototype.toDist = function() {
  this.append(']');
  fs.closeSync(this.handle);
  return new dists.SampleBasedMarginal({
    samples: [this.max],
    numSamples: 1
  });
};

module.exports = StreamingAggregator;

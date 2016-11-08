'use strict';

var _ = require('underscore');
var ad = require('adnn/ad');
var Tensor = require('./tensor');
var special = require('./math/special');

var valueRec = function(x) {
  if (ad.isLifted(x)) {
    return x.x;
  } else if (_.isArray(x)) {
    return _.map(x, valueRec);
  } else if (x instanceof Tensor) {
    // Optimization: tensors don't contain tapes, so return now rather
    // than descend into the tensor object.
    return x;
  } else if (_.isObject(x) && !_.isFunction(x)) {
    // Ensure prototype chain is preserved
    var proto = Object.getPrototypeOf(x);
    var y = _.mapObject(x, valueRec);
    return _.extendOwn(Object.create(proto), y);
    return y;
  } else {
    return x;
  }
};

ad.valueRec = valueRec;

ad.tensor.logGamma = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'logGamma',
  forward: function(a) {
    return a.logGamma();
  },
  backward: function(a) {
    var n = a.x.length;
    while (n--) {
      a.dx.data[n] += special.digamma(a.x.data[n]) * this.dx.data[n];
    }
  }
});

ad.tensor.sumreduce0 = ad.newUnaryFunction({
  OutputType: Tensor,
  name: 'sumreduce0',
  forward: function(a) {
    return a.sumreduce0();
  },
  backward: function(a) {
    var h = a.x.dims[0];
    var w = a.x.dims[1];
    for (var i = 0; i < h; i++) {
      for (var j = 0; j < w; j++) {
        a.dx.data[i * w + j] += this.dx.data[i];
      }
    }
  }
});

ad.scalar.logGamma = ad.newUnaryFunction({
  OutputType: Number,
  name: 'logGamma',
  forward: function(a) {
    return special.logGamma(a);
  },
  backward: function(a) {
    return a.dx += special.digamma(a.x) * this.dx;
  }
});

ad.scalar.plus = function(x) {
  return ad.scalar.add(0, x);
};

// HACK: Used to access Tensor in daipp.
ad.tensor['__Tensor'] = Tensor;

module.exports = ad;

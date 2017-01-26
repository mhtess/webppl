'use strict';

var assert = require('assert');
var _ = require('lodash');
var util = require('../util');
var paramStruct = require('../params/struct');

// Creates a function that modifies parameter gradients (in-place) to
// include the gradients of a weight decay penalty.

function parseOptions(opts, verbose) {
  if (opts === false) {
    // No weight decay.
    return _.noop;
  } else if (_.isNumber(opts)) {
    // For convenience, accept a number in place of an options object.
    // e.g. `{weightDecay: 0.1}`
    return penalties.l2({strength: opts}, verbose);
  } else {
    // e.g. `{weightDecay: {l2: {strength: 0.1}}}`
    return util.getValAndOpts(opts, function(penalty, opts) {
      if (!_.has(penalties, penalty)) {
        throw new Error('Optimize: Unknown weight decay penalty ' + penalty +
                        '. Choose from ' + _.keys(penalties) + '.');
      }
      return penalties[penalty](opts, verbose);
    });
  }
}

// Each penalty is expected to add a term for each parameter we
// encounter while estimating gradient.

// Note that it's not obvious that this is the right thing to do. One
// reason to think this approach is sensible (for model parameters at
// least), is that it yields an objective that is equivalent to
// including a Gaussian prior guided by a delta distribution for each
// parameter. Because we already have an argument for why we can
// ignore parameters we've not encountered in this case.

// Also, note that the alternative of penalizing all parameters at
// every step isn't practical for us, as in general the size of the
// set of all parameters used by a program can be unbounded.

var penalties = {

  // L2 penalty: 0.5 * strength * param_i^2

  l2: function(opts, verbose) {
    opts = util.mergeDefaults(opts, {
      // This default is equivalent to MAP estimation with a
      // Gaussian(0,1) prior. In general the relation is:
      // strength = 1 / sigma^2
      // i.e. strength is the precision of the prior.
      strength: 1
    });
    var strength = opts.strength;
    if (!_.isNumber(strength) || strength < 0) {
      throw new Error('Optimize: L2 strength should be a non-negative number.');
    }
    if (verbose) {
      console.log('Optimize will apply L2 weight decay with strength=' + strength + '.');
    }
    return function(gradObj, paramsObj) {
      var gradPenalty = paramStruct.select(paramsObj, gradObj);
      assert.strictEqual(_.size(gradObj), _.size(gradPenalty),
                         'Expected grads to be the same size.');
      paramStruct.mulEq(gradPenalty, strength);
      paramStruct.addEq(gradObj, gradPenalty);
    };
  }

};

module.exports = {
  parseOptions: parseOptions
};

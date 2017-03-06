'use strict';

var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var ad = require('../ad');
var util = require('../util');
var config = require('./config');
var serializeParams = require('./serialize').serializeParams;


// The local copy of the parameter table
var _params;


// Called before we start evaluating a webppl program.
function init(k) {
  var store = config.getStore();
  if (!config.isManualId()) {
    config.setFreshId();
  }
  return store.start(function() {
    return sync(k, { incremental: false });
  });
}


function stop(k) {
  var store = config.getStore();
  return store.stop(k);
}


function sync(k, options) {
  var store = config.getStore();
  var next = function(params) {
    if (!params) {
      throw new Error('Expected store to return params, got', params);
    }
    if (options && options.incremental) {
      _.assign(_params, params);
    } else {
      _params = params;
    }
    return k(_params);
  };
  return store.getParams(config.getId(), next);
}


// This is not a continuation-passing style function, since it doesn't
// make use of any store functions that could be asynchronous. Instead,
// it directly returns the current local parameter copy.
function get() {
  return _params;
}

function exists(name) {
  return _.has(_params, name);
}

// Save the local parameter table to a file
function save(filename) {
  var s = serializeParams(_params);
  fs.writeFileSync(filename, s);
}


function set(params, k) {
  var id = config.getId();
  var store = config.getStore();
  var next = function() {
    _params = params;
    return k();
  };
  return store.setParams(id, params, next);
}

function create(name, initialVal) {
  if (exists(name)) {
    throw new Error('Parameter "' + name + '" already exists.');
  }
  if (!util.isTensor(initialVal)) {
    throw new Error('Expected an (unlifted) tensor.');
  }
  var paramTable = get();
  paramTable[name] = [initialVal];
}

function fetch(name, env) {
  if (!exists(name)) {
    throw new Error('Parameter "' + name + '" does not exist.');
  }

  var paramTable = get();
  var paramsSeen = getParamsSeen(env);

  // If we're outside of optimization, just return the value of the
  // parameter, unlifted.
  if (!paramsSeen) {
    return paramTable[name][0];
  }

  // Otherwise we're doing optimization.
  if (_.has(paramsSeen, name)) {
    // Return the same AD graph node that was seen earlier this
    // execution.
    return paramsSeen[name][0];
  } else {
    // Fetch the value and lift. Add to paramsSeen so that the
    // coroutine knows to update this parameter.
    var _param = paramTable[name][0];
    var param = ad.lift(_param);
    paramsSeen[name] = [param];
    return param;
  }
}

function getParamsSeen(env) {
  function walk(coroutine) {
    return _.has(coroutine, 'paramsSeen') ? coroutine.paramsSeen :
           _.has(coroutine, 'coroutine') ? walk(coroutine.coroutine) :
           null;
  }
  return walk(env.coroutine);
}

module.exports = {
  get: get,
  set: set,
  init: init,
  stop: stop,
  save: save,
  sync: sync,
  exists: exists,
  create: create,
  fetch: fetch
};

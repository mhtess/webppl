'use strict';

var fs = require('fs');
var types = require('ast-types');
var build = types.builders;
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

var cps = require('./transforms/cps').cps;
var optimize = require('./transforms/optimize').optimize;
var naming = require('./transforms/naming').naming;
var store = require('./transforms/store').store;
var varargs = require('./transforms/varargs').varargs;
var trampoline = require('./transforms/trampoline').trampoline;
var freevars = require('./transforms/freevars').freevars;
var caching = require('./transforms/caching').caching;
var thunkify = require('./syntax').thunkify;
var analyze = require('./analysis/main').analyze;
var util = require('./util');


global.md5 = { concat: util.md5Concat };

// Container for coroutine object and shared top-level
// functions (sample, factor, exit)
var env = {};

// Make header functions globally available:
function requireHeader(path) {
  var header = require(path)(env);
  makePropertiesGlobal(header);
}

function makePropertiesGlobal(obj) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      global[prop] = obj[prop];
    }
  }
}

// Explicitly call require here to ensure that browserify notices that the
// header should be bundled.
makePropertiesGlobal(require('./header.js')(env));

function concatPrograms(p0, p1) {
  return build.program(p0.body.concat(p1.body));
}

function cachingRequired(programAST) {
  var flag = false;
  estraverse.traverse(programAST, {
    enter: function(node) {
      if (node.type === 'Identifier' && node.name === 'IncrementalMH') {
        flag = true;
        this.break();
      }
    }
  });
  return flag;
}

function prepare(programCode, verbose, doCaching) {
  if (verbose && console.time) {
    console.time('prepare');
  }

  var _prepare = function(ast) {
    // ast = freevars(ast);
    ast = thunkify(ast);
    ast = naming(ast);
    ast = cps(ast);
    ast = optimize(ast);
    return ast;
  };

  // Parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode);
  // if (doCaching)
  //   programAST = caching(programAST);
  var out = _prepare(concatPrograms(headerAST, programAST));

  if (verbose && console.timeEnd) {
    console.timeEnd('prepare');
  }
  return out;
}

function compile(programCode, verbose) {
  if (verbose && console.time) {
    console.time('compile');
  }

  var _compile = function(ast) {
    if (doCaching)
      ast = freevars(ast);
    ast = thunkify(ast);
    ast = naming(ast);
    ast = cps(ast);
    ast = store(ast);
    ast = optimize(ast);
    ast = varargs(ast);
    ast = trampoline(ast);
    return ast;
  };

  // Parse header and program, combine, compile, and generate program
  var headerAST = esprima.parse(fs.readFileSync(__dirname + '/header.wppl'));
  var programAST = esprima.parse(programCode);
  var doCaching = cachingRequired(programAST);

  if (doCaching) {
    if (verbose) console.log('Caching transforms will be applied.');
    programAST = caching(programAST);
  }

  var out = escodegen.generate(_compile(concatPrograms(headerAST, programAST)));

  if (verbose && console.timeEnd) {
    console.timeEnd('compile');
  }
  return out;
}

function run(code, contFun, verbose) {
  var compiledCode = compile(code, verbose);
  eval(compiledCode)({}, contFun, '');
}

// Compile and run some webppl code in global scope:
function webpplEval(k, code, verbose) {
  var compiledCode = compile(code, verbose);
  eval.call(global, compiledCode)({}, k, '');
}

// For use in browser
function webpplCPS(code) {
  var programAst = esprima.parse(code);
  var newProgramAst = optimize(cps(programAst));
  return escodegen.generate(newProgramAst);
}

function webpplNaming(code) {
  var programAst = esprima.parse(code);
  var newProgramAst = naming(programAst);
  return escodegen.generate(newProgramAst);
}

// For use in browser using browserify
if (util.runningInBrowser()) {
  window.webppl = {
    run: run,
    compile: compile,
    cps: webpplCPS,
    naming: webpplNaming,
    analyze: analyze
  };
  console.log('webppl loaded.');
} else {
  // Put eval into global scope. browser version??
  global.webpplEval = webpplEval;
}

module.exports = {
  webpplEval: webpplEval,
  run: run,
  prepare: prepare,
  compile: compile,
  analyze: analyze,
  requireHeader: requireHeader
};

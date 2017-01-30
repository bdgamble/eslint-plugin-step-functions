/**
 * @fileoverview lints aws step functions state machine json
 * @author Bryan Gamble
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const joi = require('joi'),
  jshint = require('jshint'),
  jppi = require('json-path-position-info');

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

const fileContents = {};

function getErrorLocation(json, path) {
  if (!path) {
    return {
      source: json,
      line: 1,
      column: 1
    };
  }
  let errorLocation;
  try {
    errorLocation = jppi(json, path, '.');
  } catch(e) {
    if (!e.message.match(/Path .* does not exist in the provided json./)) {
      throw e;
    }
    const keys = path.split('.');
    keys.pop();

    errorLocation = getErrorLocation(json, keys.join('.'));
  }

  return errorLocation;
}

// import processors
module.exports.processors = {
  '.json': {
    preprocess: function(text, filename) {
      fileContents[filename] = text;
      return [text];
    },

    postprocess: function(messages, filename) {
      jshint.JSHINT(fileContents[filename]);
      const data = jshint.JSHINT.data();
      let errors = (data && data.errors) || [];
      errors = errors
        .filter( e => !!e )
        .map( e => {
          return {
            ruleId: 'bad-json',
            severity: 2,
            message: e.reason,
            source: e.evidence,
            line: e.line,
            column: e.character
          };
        });

      if (errors.length) {
        delete fileContents[filename];
        return errors;
      }

      const json = JSON.parse(fileContents[filename]);

      const stateSchema = {
        Type: joi.string().valid('Pass', 'Succeed', 'Fail', 'Task', 'Choice', 'Wait', 'Parallel').required(),
        Comment: joi.string().optional()
      };

      const retrySchema = joi.object({
        ErrorEquals: joi.array().items(joi.string().min(1)).required(),
        IntervalSeconds: joi.number().integer().min(1).optional(),
        MaxAttempts: joi.number().integer().min(0).max(99999998).optional(),
        BackoffRate: joi.number().min(1).optional()
      }).required();

      const catchSchema = joi.object({
        ErrorEquals: joi.array().items(joi.string().min(1)).required(),
        Next: joi.string().valid(Object.keys(json.States || {})).required(),
        ResultPath: joi.string().optional()
      }).required();

      function makeRuleSchema(schema) {
        return joi.object(schema)
          .without('Variable', ['And', 'Or', 'Not'])
          .xor('StringEquals', 'StringLessThan', 'StringGreaterThan', 'StringLessThanEquals', 'StringGreaterThanEquals', 'NumericEquals', 'NumericLessThan', 'NumericGreaterThan', 'NumericLessThanEquals', 'NumericGreaterThanEquals', 'BooleanEquals', 'TimestampEquals', 'TimestampLessThan', 'TimestampGreaterThan', 'TimestampLessThanEquals', 'TimestampGreaterThanEquals', 'And', 'Or', 'Not');
      }

      const rule = {
        And: joi.array().items(joi.lazy(() => makeRuleSchema(rule))).min(1).optional(),
        Or: joi.array().items(joi.lazy(() => makeRuleSchema(rule))).min(1).optional(),
        Not: joi.lazy(() => makeRuleSchema(rule)).optional(),
        Variable: joi.string().min(1).optional(),
        StringEquals: joi.string().min(1).optional(),
        StringLessThan: joi.string().min(1).optional(),
        StringGreaterThan: joi.string().min(1).optional(),
        StringLessThanEquals: joi.string().min(1).optional(),
        StringGreaterThanEquals: joi.string().min(1).optional(),
        NumericEquals: joi.number().optional(),
        NumericLessThan: joi.number().optional(),
        NumericGreaterThan: joi.number().optional(),
        NumericLessThanEquals: joi.number().optional(),
        NumericGreaterEquals: joi.number().optional(),
        BooleanEquals: joi.boolean().optional(),
        TimestampEquals: joi.date().timestamp().optional(),
        TimestampLessThan: joi.date().timestamp().optional(),
        TimestampGreaterThan: joi.date().timestamp().optional(),
        TimestampLessThanEquals: joi.date().timestamp().optional(),
        TimestampGreaterThanEquals: joi.date().timestamp().optional()
      };

      const baseRule = Object.assign({}, rule, { Next: joi.string().valid(Object.keys(json.States || {})).required()});
      const ruleSchema = makeRuleSchema(baseRule);


      const statemachineSchema = {
        StartAt: joi.string().valid(Object.keys(json.States || {})).required(),
        Comment: joi.string().optional(),
        Version: joi.string().optional(),
        TimeoutSeconds: joi.number().integer().min(1).max(99999998)
      };
      function makeStatesSchema(states) {
        const statesSchema = {};
        Object.keys(states || {}).forEach( stateName => {
          const state = states[stateName];
          const schema = Object.assign({}, stateSchema);
          let terminalState = state.Type === 'Succeed' || state.Type === 'Fail' || state.End;
          if (['Pass', 'Task', 'Wait', 'Parallel'].indexOf(state.Type) >= 0) {
            schema.End = joi.boolean().optional();
          }

          if (!terminalState && state.Type !== 'Choice') {
            schema.Next = joi.string().valid(Object.keys(json.States)).required();
          } else {
            schema.Next = joi.forbidden();
          }

          if (state.Type !== 'Fail') {
            schema.InputPath = joi.string().optional();
            schema.ResultPath = joi.string().optional();
            schema.OutputPath = joi.string().optional();
            schema.Cause = joi.forbidden();
            schema.Error = joi.forbidden();
          } else {
            schema.InputPath = joi.forbidden();
            schema.ResultPath = joi.forbidden();
            schema.OutputPath = joi.forbidden();
            schema.Cause = joi.string().optional();
            schema.Error = joi.string().optional();
          }

          schema.Result = state.Type === 'Pass'
            ? joi.string().optional()
            : joi.forbidden();

          if (state.Type === 'Task' || state.Type === 'Parallel') {
            schema.Retry = joi.array().items(retrySchema);
            schema.Catch = joi.array().items(catchSchema);
          } else {
            schema.Retry = joi.forbidden();
            schema.Catch = joi.forbidden();
          }

          schema.Resource = state.Type === 'Task'
            ? joi.string().uri().required()
            : joi.forbidden();
          schema.HeartbeatSeconds = state.Type === 'Task'
            ? joi.number().integer().min(1).max(99999998).optional()
            : joi.forbidden();
          schema.TimeoutSeconds = state.Type === 'Task'
            ? joi.number().integer().min(1).max(99999998).optional()
            : joi.forbidden();

          schema.Choices = state.Type === 'Choice'
            ? joi.array().items(ruleSchema).min(1).required()
            : joi.forbidden();
          schema.Default = state.Type === 'Choice'
            ? joi.string().valid(Object.keys(json.States)).optional()
            : joi.forbidden();

          if (state.Type === 'Wait') {
            schema.Seconds = joi.number().min(1).optional();
            schema.SecondsPath = joi.string().min(1).optional();
            schema.Timestamp = joi.date().timestamp().optional();
            schema.TimestampPath = joi.string().min(1).optional();
          } else {
            schema.Seconds = joi.forbidden();
            schema.SecondsPath = joi.forbidden();
            schema.Timestamp = joi.forbidden();
            schema.TimestampPath = joi.forbidden();
          }

          if (state.Type === 'Parallel') {
            const branches = [].concat(state.Branches).map(branch => {
              const branchSchema = {
                StartAt: joi.string().valid(Object.keys(branch.States || {})).required(),
                Comment: joi.string().optional()
              };
              branchSchema.States = makeStatesSchema(branch.States);
              return joi.object(branchSchema).required();
            });
            schema.Branches = joi.array().ordered(branches);
          } else {
            schema.Branches = joi.forbidden();
          }

          statesSchema[stateName] = joi.object(schema)
            .without('Seconds', ['SecondsPath', 'Timestamp', 'TimestampPath'])
            .without('SecondsPath', ['Seconds', 'Timestamp', 'TimestampPath'])
            .without('Timestamp', ['SecondsPath', 'Seconds', 'TimestampPath'])
            .without('TimestampPath', ['SecondsPath', 'Seconds', 'Timestamp']);
        });

        return joi.object(statesSchema).required();
      }

      statemachineSchema.States = makeStatesSchema(json.States);

      const initValidation = joi.validate(json, joi.object(statemachineSchema), { abortEarly: false });
      if (initValidation.error && initValidation.error.isJoi === true) {
        initValidation.error.details.forEach(detail => {
          const errorLocation = getErrorLocation(fileContents[filename], detail.path);
          errors.push({
            ruleId: 'bad-step-functions-schema',
            severity: 2,
            message: detail.message,
            source: errorLocation.source,
            line: errorLocation.line,
            column: errorLocation.column
          });
        });
      } else if (initValidation.error) {
        errors.push({
          ruleId: 'unknown-error',
          severity: 1,
          message: initValidation.error.message,
          source: initValidation.error.stack
        });
      }

      delete fileContents[filename];

      return errors;
    }
  }
};


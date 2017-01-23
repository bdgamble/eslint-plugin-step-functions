/**
 * @fileoverview lints aws step functions state machine json
 * @author Bryan Gamble
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const joi = require('joi'),
  jshint = require('jshint');

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

const fileContents = {};

// import processors
module.exports.processors = {
  '.json': {
    preprocess: function(text, filename) {
      console.log('text', text);
      console.log('fn', filename);
      fileContents[filename] = text;
      return [text];
    },

    postprocess: function(messages, filename) {
      console.log('JSHINT Start');
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
        console.log('JSHINT errors', errors);
        delete fileContents[filename];
        return errors;
      }
    console.log('JSHINT end');

      const json = JSON.parse(fileContents[filename]);

      const stateSchema = {
        Type: joi.string().valid('Pass', 'Succeed', 'Fail', 'Task', 'Choice', 'Wait', 'Parallel').required(),
        Comment: joi.string().optional()
      };

      const statemachineSchema = joi.object({
        States: joi.object().pattern(/[a-zA-Z]/, joi.object(stateSchema).unknown(true)).required(),
        StartAt: joi.string().valid(Object.keys(json.States)).required(),
        Comment: joi.string().optional(),
        Version: joi.string().optional(),
        TimeoutSeconds: joi.number().max(99999998)
      });

    console.log('init joi start');

      const initValidation = joi.validate(json, statemachineSchema, { abortEarly: false });
      if (initValidation.error && initValidation.error.isJoi === true) {
          console.log('ve', initValidation.error);
        initValidation.error.details.forEach(detail => {
          errors.push({
            ruleId: 'bad-step-functions-schema',
            severity: 2,
            message: detail.message,
            source: initValidation.error.annotate(true),
            path: detail.path
          });
        });
    console.log('joi errors', errors);
      } else if (initValidation.error) {
        errors.push({
          ruleId: 'unknown-error',
          severity: 1,
          message: initValidation.error.message,
          source: initValidation.error.stack
        });
    console.log('non joi errors', errors);
      }

    console.log('init joi end');


      const retrySchema = joi.object({
        ErrorEquals: joi.array().items(joi.string().min(1)).required(),
        IntervalSeconds: joi.number().integer().min(1).optional(),
        MaxAttempts: joi.number().integer().min(0).max(99999998).optional(),
        BackoffRate: joi.number().min(1).optional()
      }).required();

      const catchSchema = joi.object({
        ErrorEquals: joi.array().items(joi.string().min(1)).required(),
        Next: joi.string().valid(Object.keys(json.States)).required(),
        ResultPath: joi.string().optional()
      }).required();

      const ruleSchema = joi.object({
        And: joi.array().items(joi.lazy(() => ruleSchema)).min(1).optional(),
        Or: joi.array().items(joi.lazy(() => ruleSchema)).min(1).optional(),
        Not: joi.lazy(() => ruleSchema).optional(),
        Next: joi.string().valid(Object.keys(json.States)).required(),
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
      })
      .without('Variable', ['And', 'Or', 'Not'])
      .xor('StringEquals', 'StringLessThan', 'StringGreaterThan', 'StringLessThanEquals', 'StringGreaterThanEquals', 'NumericEquals', 'NumericLessThan', 'NumericGreaterThan', 'NumericLessThanEquals', 'NumericGreaterThanEquals', 'BooleanEquals', 'TimestampEquals', 'TimestampLessThan', 'TimestampGreaterThan', 'TimestampLessThanEquals', 'TimestampGreaterThanEquals');

      console.log('joi states start');
      Object.keys(json.States).forEach( stateName => {
        console.log('joi state start', stateName);
        const state = json.States[stateName];
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
        }

        schema.Resource = state.Type === 'Task'
          ? joi.string().uri().required()
          : joi.forbidden();
        schema.HeartbeatSeconds = state.Type === 'Task'
          ? joi.number().integer().max(99999998).optional()
          : joi.forbidden();
        schema.TimeoutSeconds = state.Type === 'Task'
          ? joi.number().integer().max(99999998).optional()
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

        const branchSchema = joi.object({
          StartAt: joi.string().valid(Object.keys(state.States || {})).required(),
          Comment: joi.string().optional(),
          States: joi.array().items(
            joi.lazy(() => joi.Object(schema)
              .without('Seconds', ['SecondsPath', 'Timestamp', 'TimestampPath'])
              .without('SecondsPath', ['Seconds', 'Timestamp', 'TimestampPath'])
              .without('Timestamp', ['SecondsPath', 'Seconds', 'TimestampPath'])
              .without('TimestampPath', ['SecondsPath', 'Seconds', 'Timestamp'])
            )).min(1).required()
        });

        schema.Branches = state.Type === 'Parallel'
          ? joi.array().min(1).items(branchSchema)
          : joi.forbidden();

        const validation = joi.validate(
          state,
          joi.object(schema)
            .without('Seconds', ['SecondsPath', 'Timestamp', 'TimestampPath'])
            .without('SecondsPath', ['Seconds', 'Timestamp', 'TimestampPath'])
            .without('Timestamp', ['SecondsPath', 'Seconds', 'TimestampPath'])
            .without('TimestampPath', ['SecondsPath', 'Seconds', 'Timestamp']),
          {
            abortEarly: false
          }
        );

        if (validation.error && validation.error.isJoi === true) {
          console.log('ve', validation.error);
          validation.error.details.forEach(detail => {
            errors.push({
              ruleId: 'bad-step-functions-schema',
              severity: 2,
              message: detail.message,
              source: validation.error.annotate(true),
              path: detail.path
            });
          });
        console.log('joi state error', stateName, errors);
        } else if (validation.error) {
          errors.push({
            ruleId: 'unknown-error',
            severity: 1,
            message: validation.error.message,
            source: validation.error.stack
          });
        console.log('non joi state error', stateName, errors);
        }
        console.log('joi state end', stateName);

      });
      console.log('joi states end', errors);

      delete fileContents[filename];

      return errors;
    }
  }
};


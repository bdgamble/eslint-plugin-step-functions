'use strict';

const plugin = require('../lib/index.js');
const assert = require('chai').assert;

describe('step functions plugin', () => {
  describe('structure', () => {
    it('should contain processors object', () => {
      assert.property(plugin, 'processors', '.processors property is not defined');
    });
    it('should contain .json property', () => {
      assert.property(plugin.processors, '.json', '.json property is not defined');
    });
    it('should contain .json.preprocess property', () => {
      assert.property(plugin.processors['.json'], 'preprocess', '.json.preprocess is not defined');
    });
    it('should contain .json.postprocess property', () => {
      assert.property(plugin.processors['.json'], 'postprocess', '.json.postprocess is not defined');
    });
  });

  describe('preprocess', () => {
    const preprocess = plugin.processors['.json'].preprocess;
    it('should return the same text', () => {
      const fileName = 'reallyLongFileName';
      const text = 'long long text';

      const newText = preprocess(text, fileName);
      assert.isArray(newText, 'preprocess should return array');
      assert.strictEqual(newText[0], text);
    });
  });

  describe('postprocess', () => {
    const preprocess = plugin.processors['.json'].preprocess;
    const postprocess = plugin.processors['.json'].postprocess;

    describe('json validation errors', () => {
      const singleQuotes = {
        fileName: 'singleQuotes.json',
        text: "{'x': 0}"
      };
      const trailingCommas = {
        fileName: 'trailing.json',
        text: '{ "x": 0, }'
      };
      const multipleErrors = {
        fileName: 'multipleErrors.json',
        text: '{ x: 200, \'what\': 0 }'
      };
      const trailingText = {
        fileName: 'trailingtext.json',
        text: '{ "my_string": "hello world" }' + ' \n' +  'bad_text'
      };

      preprocess(singleQuotes.text, singleQuotes.fileName);
      preprocess(trailingCommas.text, trailingCommas.fileName);
      preprocess(multipleErrors.text, multipleErrors.fileName);
      preprocess(trailingText.text, trailingText.fileName);

      it('should return an error for the single quotes', () => {
        const errors = postprocess([], singleQuotes.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to first line');
        assert.strictEqual(error.column, 2, 'should point to second character');
      });

      it('should return an error for trailing commas', () => {
        const errors = postprocess([], trailingCommas.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 9, 'should point to the 9th character');
      });

      it('should report unrecoverable syntax error', () => {
        const errors = postprocess([], trailingText.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');
        assert.isString(errors[0].message, 'should have a valid message');

        // we don't validate the line/column numbers since they don't actually
        // mean anything for this error. JSHint just bails on the file.
      });

      it('should return multiple errors for multiple errors', () => {
        const errors = postprocess([], multipleErrors.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 2, 'should return one error');
      });
    });

    describe('step function schema validation errors', () => {

      const missingStartAt = {
        fileName: 'missingStartAt.json',
        text: '{ "States": {} }'
      };
      const missingStates = {
        fileName: 'missingStates.json',
        text: '{ "StartAt": "FirstState" }'
      };
      const StartAtNotFound = {
        fileName: 'StartAtNotFound.json',
        text: '{ "StartAt": "FirstState", "States": { "StartState": { "Type": "Pass", "End": true}} }'
      };
      const NegativeTimeout = {
        fileName: 'NegativeTimeout.json',
        text: '{ "StartAt": "FirstState", "TimeoutSeconds": -1, "States": { "FirstState": { "Type": "Pass", "End": true}} }'
      };
      const FailStateEndNotAllowed = {
        fileName: 'FailStateEndNotAllowed.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Fail", "End": true} } }'
      };
      const TerminalStateNextNotAllowed = {
        fileName: 'TerminalStateNextNotAllowed.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Pass", "End": true, "Next": "OtherState"}, "OtherState": { "Type": "Fail" } } }'
      };
      const NonTerminalStateNextRequired = {
        fileName: 'NonTerminalStateNextRequired.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Pass"} } }'
      };
      const TaskBadSchema = {
        fileName: 'TaskBadSchema.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Task", "TimeoutSeconds": -1, "HeartbeatSeconds": -1, "Next": "OtherState" }, "OtherState": { "Type": "Fail" } } }'
      };
      const RetrierBadSchema = {
        fileName: 'RetrierBadSchema.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Task", "Resource": "arn:example", "Retry": [{ "ErrorEquals": "Error", "IntervalSeconds": -1, "MaxAttempts": -1, "BackoffRate": 0.9}], "End": true } } }'
      };
      const CatcherBadSchema = {
        fileName: 'CatcherBadSchema.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Task", "Resource": "arn:example", "Catch": [{ "ErrorEquals": "Error"}], "End": true } } }'
      };
      const ChoiceBadSchema = {
        fileName: 'ChoiceBadSchema.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Choice", "Choices": [{ "Variable": "$.var", "StringEquals": 4, "NumericEquals": "four", "And": []}], "Next": "OtherState" } } }'
      };
      const WaitBadSchema = {
        fileName: 'WaitBadSchema.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Wait", "Seconds": 0, "SecondsPath": "$.secs", "Timestamp": "Tuesday", "TimestampPath": "$.ts", "Next": "OtherState" }, "OtherState": { "Type": "Fail"} } }'
      };
      const ParallelBadSchema = {
        fileName: 'ParallelBadSchema.json',
        text: '{ "StartAt": "FirstState", "States": { "FirstState": { "Type": "Parallel", "Branches": [{"StartAt": "ParallelA", "States": {}}, {"States": {"ParallelA": {"Type": "Fail"}}}], "Next": "OtherState" }, "OtherState": { "Type": "Fail"} } }'
      };

      preprocess(missingStartAt.text, missingStartAt.fileName);
      preprocess(missingStates.text, missingStates.fileName);
      preprocess(StartAtNotFound.text, StartAtNotFound.fileName);
      preprocess(NegativeTimeout.text, NegativeTimeout.fileName);
      preprocess(FailStateEndNotAllowed.text, FailStateEndNotAllowed.fileName);
      preprocess(TerminalStateNextNotAllowed.text, TerminalStateNextNotAllowed.fileName);
      preprocess(NonTerminalStateNextRequired.text, NonTerminalStateNextRequired.fileName);
      preprocess(TaskBadSchema.text, TaskBadSchema.fileName);
      preprocess(RetrierBadSchema.text, RetrierBadSchema.fileName);
      preprocess(CatcherBadSchema.text, CatcherBadSchema.fileName);
      preprocess(ChoiceBadSchema.text, ChoiceBadSchema.fileName);
      preprocess(WaitBadSchema.text, WaitBadSchema.fileName);
      preprocess(ParallelBadSchema.text, ParallelBadSchema.fileName);

      it('should return an error for missing StartAt property', () => {
        const errors = postprocess([], missingStartAt.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 1, 'should point to the 1st character');
      });

      it('should return an error for missing States property', () => {
        const errors = postprocess([], missingStates.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 2, 'should return two errors');

        const notFoundStartAt = errors[0];
        assert.strictEqual(notFoundStartAt.line, 1, 'should point to the first line');
        assert.strictEqual(notFoundStartAt.column, 3, 'should point to the 3rd character');
        const statesRequired = errors[1];
        assert.strictEqual(statesRequired.line, 1, 'should point to the first line');
        assert.strictEqual(statesRequired.column, 1, 'should point to the 1st character');
      });

      it('should return an error for not found StartAt property', () => {
        const errors = postprocess([], StartAtNotFound.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 3, 'should point to the 3rd character');
        assert.strictEqual(error.message, '"StartAt" must be one of [StartState]');
      });

      it('should return an error for negative TimeoutSeconds property', () => {
        const errors = postprocess([], NegativeTimeout.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 28, 'should point to the 3rd character');
        assert.strictEqual(error.message, '"TimeoutSeconds" must be larger than or equal to 1');
      });

      it('should return an error for Fail state having End property', () => {
        const errors = postprocess([], FailStateEndNotAllowed.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 72, 'should point to the 72nd character');
        assert.strictEqual(error.message, '"End" is not allowed');
      });

      it('should return an error for Terminal state having Next property', () => {
        const errors = postprocess([], TerminalStateNextNotAllowed.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 85, 'should point to the 85th character');
        assert.strictEqual(error.message, '"Next" is not allowed');
      });

      it('should return an error for Non-Terminal state not having Next property', () => {
        const errors = postprocess([], NonTerminalStateNextRequired.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 1, 'should return one error');

        const error = errors[0];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 40, 'should point to the 40th character');
        assert.strictEqual(error.message, '"Next" is required');
      });

      it('should errors for Task state, badSchema', () => {
        const errors = postprocess([], TaskBadSchema.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 3, 'should return three errors');

        const resourceRequired = errors[0];
        assert.strictEqual(resourceRequired.line, 1, 'should point to the first line');
        assert.strictEqual(resourceRequired.column, 40, 'should point to the 40th character');
        assert.strictEqual(resourceRequired.message, '"Resource" is required');

        const timeoutPositive = errors[1];
        assert.strictEqual(timeoutPositive.line, 1, 'should point to the first line');
        assert.strictEqual(timeoutPositive.column, 94, 'should point to the 94th character');
        assert.strictEqual(timeoutPositive.message, '"HeartbeatSeconds" must be larger than or equal to 1');

        const heartbeatPositive = errors[2];
        assert.strictEqual(heartbeatPositive.line, 1, 'should point to the first line');
        assert.strictEqual(heartbeatPositive.column, 72, 'should point to the 72nd character');
        assert.strictEqual(heartbeatPositive.message, '"TimeoutSeconds" must be larger than or equal to 1');
      });

      it('should return errors for Retrier bad schema', () => {
        const errors = postprocess([], RetrierBadSchema.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 5, 'should return five errors');

        const typeError = errors[0];
        assert.strictEqual(typeError.line, 1, 'should point to the first line');
        assert.strictEqual(typeError.column, 111, 'should point to the 111th character');
        assert.strictEqual(typeError.message, '"ErrorEquals" must be an array');

        const intervalSecondsError = errors[1];
        assert.strictEqual(intervalSecondsError.line, 1, 'should point to the first line');
        assert.strictEqual(intervalSecondsError.column, 135, 'should point to the 135th character');
        assert.strictEqual(intervalSecondsError.message, '"IntervalSeconds" must be larger than or equal to 1');

        const maxAttemptsError = errors[2];
        assert.strictEqual(maxAttemptsError.line, 1, 'should point to the first line');
        assert.strictEqual(maxAttemptsError.column, 158, 'should point to the 158th character');
        assert.strictEqual(maxAttemptsError.message, '"MaxAttempts" must be larger than or equal to 0');

        const error = errors[3];
        assert.strictEqual(error.line, 1, 'should point to the first line');
        assert.strictEqual(error.column, 177, 'should point to the 177th character');
        assert.strictEqual(error.message, '"BackoffRate" must be larger than or equal to 1');
      });

      it('should return errors for Catcher bad schema', () => {
        const errors = postprocess([], CatcherBadSchema.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 3, 'should return three errors');

        const typeError = errors[0];
        assert.strictEqual(typeError.line, 1, 'should point to the first line');
        assert.strictEqual(typeError.column, 111, 'should point to the 111th character');
        assert.strictEqual(typeError.message, '"ErrorEquals" must be an array');

        const intervalSecondsError = errors[1];
        assert.strictEqual(intervalSecondsError.line, 1, 'should point to the first line');
        assert.strictEqual(intervalSecondsError.column, 109, 'should point to the 109th character');
        assert.strictEqual(intervalSecondsError.message, '"Next" is required');
      });

      it('should return errors for Choice bad schema', () => {
        const errors = postprocess([], ChoiceBadSchema.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 7, 'should return seven errors');

        const nextNotAllowed = errors[0];
        assert.strictEqual(nextNotAllowed.line, 1, 'should point to the first line');
        assert.strictEqual(nextNotAllowed.column, 166, 'should point to the 166th character');
        assert.strictEqual(nextNotAllowed.message, '"Next" is not allowed');

        const andNotEmpty = errors[1];
        assert.strictEqual(andNotEmpty.line, 1, 'should point to the first line');
        assert.strictEqual(andNotEmpty.column, 153, 'should point to the 153rd character');
        assert.strictEqual(andNotEmpty.message, '"And" must contain at least 1 items');

        const stringEqualsType = errors[2];
        assert.strictEqual(stringEqualsType.line, 1, 'should point to the first line');
        assert.strictEqual(stringEqualsType.column, 109, 'should point to the 109th character');
        assert.strictEqual(stringEqualsType.message, '"StringEquals" must be a string');

        const numericEqualsType = errors[3];
        assert.strictEqual(numericEqualsType.line, 1, 'should point to the first line');
        assert.strictEqual(numericEqualsType.column, 128, 'should point to the 128th character');
        assert.strictEqual(numericEqualsType.message, '"NumericEquals" must be a number');

        const nextRequired = errors[4];
        assert.strictEqual(nextRequired.line, 1, 'should point to the first line');
        assert.strictEqual(nextRequired.column, 86, 'should point to the 86th character');
        assert.strictEqual(nextRequired.message, '"Next" is required');

        const variableConflictAnd = errors[5];
        assert.strictEqual(variableConflictAnd.line, 1, 'should point to the first line');
        assert.strictEqual(variableConflictAnd.column, 88, 'should point to the 88th character');
        assert.strictEqual(variableConflictAnd.message, '"Variable" conflict with forbidden peer "And"');

        const oneComparison = errors[6];
        assert.strictEqual(oneComparison.line, 1, 'should point to the first line');
        assert.strictEqual(oneComparison.column, 86, 'should point to the 86th character');
        assert.match(oneComparison.message, /^"value" contains a conflict between exclusive peers/);
      });

      it('should return errors for Wait bad schema', () => {
        const errors = postprocess([], WaitBadSchema.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 6, 'should return six errors');

        const positiveSeconds = errors[0];
        assert.strictEqual(positiveSeconds.line, 1, 'should point to the first line');
        assert.strictEqual(positiveSeconds.column, 72, 'should point to the 72nd character');
        assert.strictEqual(positiveSeconds.message, '"Seconds" must be larger than or equal to 1');

        const timestampError = errors[1];
        assert.strictEqual(timestampError.line, 1, 'should point to the first line');
        assert.strictEqual(timestampError.column, 111, 'should point to the 111th character');
        assert.strictEqual(timestampError.message, '"Timestamp" must be a valid timestamp or number of milliseconds');

        const secondsConflict = errors[2];
        assert.strictEqual(secondsConflict.line, 1, 'should point to the first line');
        assert.strictEqual(secondsConflict.column, 72, 'should point to the 72nd character');
        assert.strictEqual(secondsConflict.message, '"Seconds" conflict with forbidden peer "SecondsPath"');

        const secondsPathConflict = errors[3];
        assert.strictEqual(secondsPathConflict.line, 1, 'should point to the first line');
        assert.strictEqual(secondsPathConflict.column, 86, 'should point to the 86th character');
        assert.strictEqual(secondsPathConflict.message, '"SecondsPath" conflict with forbidden peer "Seconds"');

        const timestampConflict = errors[4];
        assert.strictEqual(timestampConflict.line, 1, 'should point to the first line');
        assert.strictEqual(timestampConflict.column, 111, 'should point to the 111th character');
        assert.strictEqual(timestampConflict.message, '"Timestamp" conflict with forbidden peer "SecondsPath"');

        const timestampPathConflict = errors[5];
        assert.strictEqual(timestampPathConflict.line, 1, 'should point to the first line');
        assert.strictEqual(timestampPathConflict.column, 135, 'should point to the 135th character');
        assert.strictEqual(timestampPathConflict.message, '"TimestampPath" conflict with forbidden peer "SecondsPath"');
      });

      it('should errors for Parallel state, badSchema', () => {
        const errors = postprocess([], ParallelBadSchema.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 2, 'should return two errors');

        const statesNotEmpty = errors[0];
        assert.strictEqual(statesNotEmpty.line, 1, 'should point to the first line');
        assert.strictEqual(statesNotEmpty.column, 90, 'should point to the 114th character');
        assert.strictEqual(statesNotEmpty.message, '"StartAt" must be one of []');

        const startAtRequired = errors[1];
        assert.strictEqual(startAtRequired.line, 1, 'should point to the first line');
        assert.strictEqual(startAtRequired.column, 129, 'should point to the 129th character');
        assert.strictEqual(startAtRequired.message, '"StartAt" is required');
      });
    });

    describe('step functions valid schema', () => {
      const valid = {
        fileName: 'valid.json',
        text: '{ "StartAt": "Task", "States": { "Task": { "Type": "Task", "Resource": "arn:test", "Retry": [{ "ErrorEquals": ["Error"], "MaxAttempts": 2, "BackoffRate": 1.5}], "Catch": [{"ErrorEquals": ["KnownError"], "Next": "FailState"}], "Next": "Choice" }, "FailState": { "Type": "Fail", "Cause": "KnownError", "Error": "CaughtKnownError"}, "Choice": { "Type": "Choice",  "Choices": [{"Variable": "$.parallel", "BooleanEquals": true, "Next": "Parallel" }, {"Not": { "Variable": "$.parallel", "BooleanEquals": true }, "Next": "Wait" }] }, "Parallel": { "Type": "Parallel", "Branches": [{ "StartAt": "ParallelA", "States": { "ParallelA": { "Type": "Pass", "End": true } } }, { "StartAt": "ParallelB", "States": { "ParallelB": { "Type": "Pass", "Result": "$.b", "End": true } } }], "Next": "Success" }, "Wait": { "Type": "Wait", "Seconds": 1, "Next": "Success" }, "Success": { "Type": "Succeed" } } }'
      };
      preprocess(valid.text, valid.fileName);

      it('returns no errors for valid schema', () => {
        const errors = postprocess([], valid.fileName);
        assert.isArray(errors, 'should return an array');
        assert.lengthOf(errors, 0, 'should return no errors');
      });
    });
  });
});

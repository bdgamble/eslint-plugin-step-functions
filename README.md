# eslint-plugin-step-functions

[![Greenkeeper badge](https://badges.greenkeeper.io/bdgamble/eslint-plugin-step-functions.svg)](https://greenkeeper.io/)

lints aws step functions state machine json

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-plugin-step-functions`:

```
$ npm install eslint-plugin-step-functions --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-plugin-step-functions` globally.

## Usage

Add `step-functions` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "step-functions"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "step-functions/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here






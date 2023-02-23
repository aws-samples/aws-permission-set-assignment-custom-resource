/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

const { execSync } = require('child_process');
const { awscdk } = require('projen');
const { NodePackageManager } = require('projen/lib/javascript');
const { ReleaseTrigger } = require('projen/lib/release');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: `${execSync('npm show \'aws-cdk-lib\' version')}`.trim(),
  defaultReleaseBranch: 'main',
  name: 'aws-cfct-permission-set-assignment-custom-resource',
  deps: ['aws-lambda',
    '@aws-lambda-powertools/tracer',
    '@aws-lambda-powertools/metrics',
    '@aws-lambda-powertools/logger',
    '@aws-sdk/client-cloudformation',
    '@aws-sdk/client-organizations',
    '@aws-sdk/client-sso-admin',
    '@aws-sdk/client-identitystore',
    '@aws-sdk/client-sfn',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/util-dynamodb',
    '@aws-sdk/client-cloudformation',
    'cdk-nag'],
  devDeps: ['eslint-plugin-jest', '@types/aws-lambda', 'aws-sdk-client-mock'],
  appEntrypoint: 'infrastructure.ts',
  packageManager: NodePackageManager.NPM,
  gitignore: ['.idea/', '*.bkp', '*.dtmp', 'repolinter.results.txt', '*.output*', '*_report_result.txt', 'examples/python-usage/.venv', 'examples/python-usage/node_modules', 'examples/python-usage/dist', 'examples/python-usage/cdk.out', 'examples/python-usage/.pytest_cache'],
  jestOptions: {
    jestConfig: {
      setupFiles: ['./.jest/setEnvVars.js'],
    },
  },
  license: 'MIT-0',
  copyrightOwner: 'Amazon.com, Inc. or its affiliates. All Rights Reserved.',
  release: true,
  eslint: true,
  eslintOptions: {
    prettier: false,
  },
  releaseTrigger: ReleaseTrigger.manual(),

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.eslint.addPlugins('jest');
project.eslint.rules.quotes = ['error', 'single', { avoidEscape: true }];
// Style
project.eslint.rules.quotes = ['error', 'single', { avoidEscape: true }];
project.eslint.rules['comma-dangle'] = ['error', 'always-multiline']; // ensures clean diffs, see https://medium.com/@nikgraf/why-you-should-enforce-dangling-commas-for-multiline-statements-d034c98e36f8
project.eslint.rules['comma-spacing'] = ['error', {
  before: false,
  after: true,
}]; // space after, no space before
project.eslint.rules['no-multi-spaces'] = ['error', { ignoreEOLComments: false }]; // no multi spaces
project.eslint.rules['array-bracket-spacing'] = ['error', 'never']; // [1, 2, 3]
project.eslint.rules['array-bracket-newline'] = ['error', 'consistent']; // enforce consistent line breaks between brackets
project.eslint.rules['object-curly-spacing'] = ['error', 'always']; // { key: 'value' }
project.eslint.rules['object-curly-newline'] = ['error', {
  multiline: true,
  consistent: true,
}]; // enforce consistent line breaks between braces
project.eslint.rules['object-property-newline'] = ['error', { allowAllPropertiesOnSameLine: true }]; // enforce "same line" or "multiple line" on object properties
project.eslint.rules['keyword-spacing'] = ['error']; // require a space before & after keywords
project.eslint.rules['brace-style'] = ['error', '1tbs', { allowSingleLine: true }]; // enforce one true brace style
project.eslint.rules['space-before-blocks'] = 'error'; // require space before blocks
project.eslint.rules.curly = ['error', 'multi-line', 'consistent']; // require curly braces for multiline control statements
project.eslint.rules['max-len'] = ['error', {
  code: 150,
  ignoreComments: true,
  ignoreUrls: true,
  ignoreRegExpLiterals: true,
}];
project.eslint.rules['no-var'] = ['error'];
project.synth();
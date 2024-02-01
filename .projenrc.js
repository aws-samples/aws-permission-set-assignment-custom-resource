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
    '@middy/core',
    '@aws-sdk/client-sqs',
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
  appEntrypoint: 'infrastructure/main.ts',
  packageManager: NodePackageManager.NPM,
  gitignore: ['.DS_Store', '.idea/', '*.bkp', '*.dtmp', 'repolinter.results.txt', '*.output*', '*_report_result.txt',
    'examples/python-usage/.venv', 'examples/python-usage/node_modules', 'examples/python-usage/dist', 'examples/python-usage/cdk.out',
    'examples/python-usage/.pytest_cache'],
  jestOptions: {
    jestConfig: {
      setupFiles: ['./.jest/setEnvVars.js'],
    },
  },
  license: 'MIT-0',
  copyrightOwner: 'Amazon.com, Inc. or its affiliates. All Rights Reserved.',
  release: true,
  projenrcTs: true,
  eslintOptions: {
    prettier: true,
    dirs: ['src/runtime'],
    devdirs: ['test', 'src/infrastructure'],
    ignorePatterns: ['src/main.ts'],
  },
  prettierOptions: {
    settings: {
      printWidth: 120,
    },
  },
  releaseTrigger: ReleaseTrigger.manual(),
  context: {
    '@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId': false,
    '@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021': false,
    '@aws-cdk/aws-rds:lowercaseDbIdentifier': false,
    '@aws-cdk/core:stackRelativeExports': false,
  },
  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});


project.tasks.tryFind('synth').reset('cdk synth', {
  receiveArgs: true,
});
project.synth();
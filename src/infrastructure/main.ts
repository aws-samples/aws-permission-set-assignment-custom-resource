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

import { paginateListInstances, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { App, Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ControlTowerLifeCycleEventSourceRuleStack } from './stacks/ControlTowerLifeCycleEventSourceRuleStack';
import { PermissionSetAssignmentCustomResourceStack } from './stacks/PermissionSetAssignmentCustomResourceStack';


// for development, use account/region from cdk cli
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};
(async () => {
  const app = new App();

  const managementAccountId = app.node.tryGetContext('managementAccountId');
  if (managementAccountId != undefined) {
    let instanceId = app.node.tryGetContext('instanceId');
    if (instanceId == undefined) {
      console.log('No IAM Identity Center instance id specified in context, attempting to look up instance id via api');
      const client = new SSOAdminClient({ region: env.region });
      const paginator = paginateListInstances({
        client: client,
      }, {});
      for await (const page of paginator) {
        if (instanceId != undefined) {
          throw new Error('More than one IAM Identity Center instance found, I\'m not sure which one to choose');
        }
        if (page.Instances != undefined && page.Instances.length == 1 && page.Instances[0].InstanceArn != undefined) {
          instanceId = page.Instances[0].InstanceArn;
          const split_instance_id = instanceId.split('/');
          instanceId = split_instance_id[split_instance_id.length - 1];
          break;
        } else {
          throw new Error('Could not lookup IAM Identity Center instance');
        }
      }
      console.log(`Found IAM Identity Center instance id: ${instanceId}`);
    }
    new PermissionSetAssignmentCustomResourceStack(app, 'PermissionSetAssignmentCustomResourceStack', {
      env: env,
      managementAccountId: managementAccountId,
      instanceId: instanceId,

    });
  }
  const targetEventBusArn = app.node.tryGetContext('targetEventBusArn');
  if (targetEventBusArn != undefined) {
    new ControlTowerLifeCycleEventSourceRuleStack(app, 'ControlTowerLifeCycleEventSourceRuleStack', {
      env: env,
      targetEventBusArn: targetEventBusArn,
    });
  }
  Aspects.of(app).add(new AwsSolutionsChecks({ reports: true }));

  app.synth();
})().then(_value => {
  console.log('Success');
}).catch(reason => {
  const error=reason as Error;
  console.error(`There was a problem with deployment ${error.name} - ${error.message}: ${error.stack}`);
});



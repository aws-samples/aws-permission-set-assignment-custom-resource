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

import { randomUUID } from 'crypto';
import { Logger } from '@aws-lambda-powertools/logger';
import { Callback, CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { Aws } from './aws';
import { AccountAssignmentCommandInput, AssignmentPayloadType, defaultCallback, TargetOperation } from './model';
import { PermissionSetAssignmentPropertiesDiff } from './PermissionSetAssignmentPropertiesDiff';

const logger = new Logger({ serviceName: 'permissionSetAssignmentHandler' });


export const onEvent = async (event: CdkCustomResourceEvent,
  // @ts-ignore
  context: Context,
  // @ts-ignore
  callback: Callback = defaultCallback,
  aws: Aws = new Aws()): Promise<CdkCustomResourceResponse> => {
  logger.info(`Event: ${JSON.stringify(event, null, 2)}`);

  let inputs: AccountAssignmentCommandInput[] = [];
  let targets: TargetOperation[] = [];
  let physicalResourceId: string;

  switch (event.RequestType) {
    case 'Create':
      physicalResourceId = randomUUID({});

      [inputs, targets] = await aws.accountAssignmentCommandInputs(AssignmentPayloadType.CREATE, {
        GroupNames: event.ResourceProperties.GroupNames,
        PermissionSetNames: event.ResourceProperties.PermissionSetNames,
        TargetAccountIds: event.ResourceProperties.TargetAccountIds,
        UserNames: event.ResourceProperties.UserNames,
        TargetOrganizationalUnitNames: event.ResourceProperties.TargetOrganizationalUnitNames,
      });
      break;
    case 'Delete':

      physicalResourceId = event.PhysicalResourceId;

      [inputs, targets] = await aws.accountAssignmentCommandInputs(AssignmentPayloadType.DELETE, {
        GroupNames: event.ResourceProperties.GroupNames,
        PermissionSetNames: event.ResourceProperties.PermissionSetNames,
        TargetAccountIds: event.ResourceProperties.TargetAccountIds,
        UserNames: event.ResourceProperties.UserNames,
        TargetOrganizationalUnitNames: event.ResourceProperties.TargetOrganizationalUnitNames,
      });
      break;
    case 'Update':
      physicalResourceId = event.PhysicalResourceId;

      const diff: PermissionSetAssignmentPropertiesDiff = new PermissionSetAssignmentPropertiesDiff({
        GroupNames: event.ResourceProperties.GroupNames,
        PermissionSetNames: event.ResourceProperties.PermissionSetNames,
        TargetAccountIds: event.ResourceProperties.TargetAccountIds,
        UserNames: event.ResourceProperties.UserNames,
        TargetOrganizationalUnitNames: event.ResourceProperties.TargetOrganizationalUnitNames,
      }, {
        GroupNames: event.OldResourceProperties.GroupNames,
        PermissionSetNames: event.OldResourceProperties.PermissionSetNames,
        TargetAccountIds: event.OldResourceProperties.TargetAccountIds,
        UserNames: event.OldResourceProperties.UserNames,
        TargetOrganizationalUnitNames: event.OldResourceProperties.TargetOrganizationalUnitNames,
      });

      if (!diff.isEmpty()) {
        for (const add of diff.results.adds) {

          const [i, t] = await aws.accountAssignmentCommandInputs(AssignmentPayloadType.CREATE, add);
          inputs.push(...i);
          targets.push(...t);
        }
        for (const remove of diff.results.removes) {

          const [i, t] = await aws.accountAssignmentCommandInputs(AssignmentPayloadType.DELETE, remove);
          inputs.push(...i);
          targets.push(...t);
        }
      } else {
        logger.debug('No diff, so running inputs directly');
        [inputs, targets] = await aws.accountAssignmentCommandInputs(AssignmentPayloadType.CREATE, {
          GroupNames: event.ResourceProperties.GroupNames,
          PermissionSetNames: event.ResourceProperties.PermissionSetNames,
          TargetAccountIds: event.ResourceProperties.TargetAccountIds,
          UserNames: event.ResourceProperties.UserNames,
          TargetOrganizationalUnitNames: event.ResourceProperties.TargetOrganizationalUnitNames,
        });
      }

      break;
  }
  let response: CdkCustomResourceResponse;
  try {

    const executionArn = await aws.startAccountAssignmentsExecution(process.env.STATE_MACHINE_ARN!, inputs);
    await aws.putExecutionRecord(physicalResourceId, executionArn);
    await aws.associateTargetsToStack(event.StackId, targets);

    let result: CdkCustomResourceResponse = {
      PhysicalResourceId: physicalResourceId,
      IsComplete: false,
      RequestType: event.RequestType,
    };
    return result;
  } catch (e) {
    const error = e as Error;
    response = {
      IsComplete: true,
      Data: {
        error: error,
      },
      Failed: true,
    };

  }
  logger.info(`Response: ${JSON.stringify(response, null, 2)}`);
  return response;

};


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

import { Logger } from '@aws-lambda-powertools/logger';
import { UpdateStackCommandOutput } from '@aws-sdk/client-cloudformation';
import { Account, OrganizationalUnit } from '@aws-sdk/client-organizations';
import { Callback, Context, EventBridgeEvent } from 'aws-lambda';
import { Aws } from './aws';
import { defaultCallback } from './model';

const logger = new Logger({ serviceName: 'controlTowerLifeCycleEventHandler' });

// @ts-ignore
export const onUpdateManagedAccount = async (event: EventBridgeEvent<string, any>, context: Context, callback: Callback = defaultCallback,
  aws: Aws = new Aws()): Promise<string[]> => {
  logger.info(`onUpdateManagedAccount Event: ${JSON.stringify(event, null, 2)}`);
  const organizationalUnitName = event.detail.serviceEventDetails.updateManagedAccountStatus.organizationalUnit.organizationalUnitName;
  const organizationalUnitId = event.detail.serviceEventDetails.updateManagedAccountStatus.organizationalUnit.organizationalUnitId;
  const accountId = event.detail.serviceEventDetails.updateManagedAccountStatus.account.accountId;
  const accountName = event.detail.serviceEventDetails.updateManagedAccountStatus.account.accountName;
  return onControlTowerLifeCycleEvent({
    Id: organizationalUnitId,
    Name: organizationalUnitName,
  }, {
    Id: accountId,
    Name: accountName,
  }, aws);


};

export const onCreateManagedAccount = async (event: EventBridgeEvent<any, any>,
  // @ts-ignore
  context: Context,
  // @ts-ignore
  callback: Callback = defaultCallback,
  aws: Aws = new Aws()): Promise<string[]> => {
  logger.info(`onCreateManagedAccount Event: ${JSON.stringify(event, null, 2)}`);
  const organizationalUnitName = event.detail.serviceEventDetails.createManagedAccountStatus.organizationalUnit.organizationalUnitName;
  const organizationalUnitId = event.detail.serviceEventDetails.createManagedAccountStatus.organizationalUnit.organizationalUnitId;
  const accountId = event.detail.serviceEventDetails.createManagedAccountStatus.account.accountId;
  const accountName = event.detail.serviceEventDetails.createManagedAccountStatus.account.accountName;
  return onControlTowerLifeCycleEvent({
    Id: organizationalUnitId,
    Name: organizationalUnitName,
  }, {
    Id: accountId,
    Name: accountName,
  }, aws);

};

const onControlTowerLifeCycleEvent = async (organizationalUnit: OrganizationalUnit, account: Account, aws: Aws = new Aws()): Promise<string[]> => {
  logger.info(`onControlTowerLifeCycleEvent:  organizationalUnit=${JSON.stringify(organizationalUnit)}, account=${JSON.stringify(account)}`);

  const associations = await aws.getStackAssociations(organizationalUnit, account);
  logger.info(`Found ${associations.length} associations`);
  const results: UpdateStackCommandOutput[] = [];
  for (const association of associations) {
    logger.info(`association: ${association}`);
    const stackIds: string[] = 'stackIds' in association ? association.stackIds : [];

    for (const stackId of stackIds) {
      logger.info(`Rerun ${stackId}`);
      const updates = await aws.rerunPermissionSetAssignmentStack(stackId);
      results.push(...updates);
    }

  }
  return results.map(value => {
    return value.StackId!;
  });


};
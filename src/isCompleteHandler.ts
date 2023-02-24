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
import { Callback, CdkCustomResourceEvent, CdkCustomResourceResponse, Context } from 'aws-lambda';
import { CdkCustomResourceIsCompleteResponse } from 'aws-lambda/trigger/cdk-custom-resource';
import { Aws } from './aws';
import { AccountAssignmentsExecutionStatus, defaultCallback } from './model';

const logger = new Logger({ serviceName: 'isCompleteHandler' });


export const isComplete = async (event: CdkCustomResourceEvent,
  // @ts-ignore
  context: Context,
  // @ts-ignore
  callback: Callback = defaultCallback,
  aws: Aws = new Aws()): Promise<CdkCustomResourceResponse> => {
  logger.info(`Event: ${JSON.stringify(event, null, 2)}`);
  const requestType = event.RequestType;
  let response: CdkCustomResourceIsCompleteResponse;


  if ('PhysicalResourceId' in event) {
    const physicalResourceId = event.PhysicalResourceId;
    const executionArn = await aws.getExecutionArnFromPhysicalResourceId(physicalResourceId);
    const status: AccountAssignmentsExecutionStatus = await aws.getAccountAssignmentsExecutionStatus(executionArn);
    logger.info(`Status: ${status.status}`);
    if (status.status == 'SUCCEEDED') {
      if (requestType == 'Delete') {
        //delete the physical resource id from the table
        await aws.deleteExecutionRecord(physicalResourceId);
      }
      response = {
        IsComplete: true,
      };
    } else if (status.status == 'ABORTED' || status.status == 'FAILED' || status.status == 'TIMED_OUT') {


      logger.error(`${status.status} : ${status.error} - ${status.cause}`);
      response = {
        IsComplete: true,
      };

    } else {
      response = {
        IsComplete: false,
      };
    }
  } else {
    logger.warn('No PhysicalResourceId present in event');
    response = {
      IsComplete: true,
    };
  }


  logger.info(`Response: ${JSON.stringify(response, null, 2)}`);
  return response;

};
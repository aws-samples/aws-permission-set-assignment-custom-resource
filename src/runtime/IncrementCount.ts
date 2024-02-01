/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { Context, SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';

const ddbClient = new DynamoDBClient({ logger: console });
const sfnClient = new SFNClient({ logger: console });

export const onEventHandler = async (
  event: SQSEvent,
  //@ts-ignore
  _context: Context,
  //@ts-ignore
  _callback: Callback,
): Promise<SQSBatchResponse | undefined> => {
  console.log(`Event: ${JSON.stringify(event)}`);
  const failures: SQSBatchItemFailure[] = [];

  if (event.Records == undefined) {
    return {
      batchItemFailures: failures,
    };
  }
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const stepFunctionArn = process.env.STATE_MACHINE_ARN;

    if (stepFunctionArn != null) {
      try {
        await ddbClient.send(new UpdateItemCommand({
          TableName: process.env.TABLE_NAME,
          Key: {
            pk: {
              S: stepFunctionArn,
            },

          },
          UpdateExpression: 'ADD #c :inc',
          ExpressionAttributeNames: {
            '#c': 'counter',
          },
          ExpressionAttributeValues: {
            ':inc': {
              N: '1',
            },
            ':MAX_CONCURRENCY': {
              N: process.env.MAX_CONCURRENCY!,
            },
          },
          ConditionExpression: '#c < :MAX_CONCURRENCY',

        }));
        const sfnResponse = await sfnClient.send(new StartExecutionCommand({
          stateMachineArn: process.env.STATE_MACHINE_ARN,
          input: JSON.stringify(body),
          traceHeader: record.messageId,
        }));
        console.log(`Execution ARN: ${sfnResponse.executionArn} started ${sfnResponse.startDate}`);
      } catch (e) {
        const error = e as Error;
        console.error(`Error: ${error}`);
        if ('ConditionalCheckFailedException' == error.name) {
          failures.push({
            itemIdentifier: record.messageId,
          });
        }

      }
    } else {
      throw new Error('No step function arn provided');
    }
  }

  return {
    batchItemFailures: failures,
  };
};
export const handler = async (event: SQSEvent, _context: Context): Promise<{ [name: string]: string | number | undefined }> => {
  console.log(`"Event: ${JSON.stringify(event)}`);


  return {};

};
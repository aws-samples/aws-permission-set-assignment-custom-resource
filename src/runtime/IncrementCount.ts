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

import { Logger } from '@aws-lambda-powertools/logger';
import { logMetrics, Metrics } from '@aws-lambda-powertools/metrics';
import { captureLambdaHandler, Tracer } from '@aws-lambda-powertools/tracer';
import middy from '@middy/core';
import { Context, SQSBatchItemFailure, SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { Aws, AwsApiCalls } from './Aws';


const logger = new Logger({
    serviceName: 'IncrementCount',
});
const metrics = new Metrics({
    namespace: process.env.METRIC_NAMESPACE!,
    serviceName: 'IncrementCount',
});
const tracer = new Tracer({
    serviceName: 'IncrementCount',
    enabled: true,
    captureHTTPsRequests: true,
});
const stepFunctionArn = process.env.STATE_MACHINE_ARN!;
export const onEventHandler = async (
    event: SQSEvent,
    //@ts-ignore
    _context: Context,
    //@ts-ignore
    _callback: Callback,
    aws: AwsApiCalls = Aws.instance({}, tracer),
): Promise<SQSBatchResponse | undefined> => {
    logger.info(`Event: ${JSON.stringify(event)}`);
    const failures: SQSBatchItemFailure[] = [];

    if (event.Records == undefined) {
        logger.info('No records available');
        return {
            batchItemFailures: failures,
        };
    }


    for (const record of event.Records) {

        let failure = await incrementCounter(stepFunctionArn, record, aws);
        if (failure != undefined) {
            failures.push(failure);
        } else {
            logger.info(`Attempting to invoke state machine: ${stepFunctionArn}`);
            const body = JSON.parse(record.body);
            const sfnResponse = await aws.startExecution({
                stateMachineArn: stepFunctionArn,
                input: JSON.stringify(body),
            });
            logger.info(`Execution ARN: ${sfnResponse.executionArn} started ${sfnResponse.startDate}`);
        }
    }

    return {
        batchItemFailures: failures,
    };
};

async function insertCounter(stepFunctionArn: string, record: SQSRecord, aws: AwsApiCalls): Promise<SQSBatchItemFailure | undefined> {
    try {
        logger.info('Attempting to insert counter if not exists');

        const ddbResponse = await aws.putItem({
            TableName: process.env.TABLE_NAME,
            Item: {
                pk: {
                    S: stepFunctionArn,
                },
                counter: {
                    N: '0',
                },

            },
            ConditionExpression: 'attribute_not_exists(pk)',
            ReturnValues: 'NONE',
        });
        logger.info(`Lock incremented: ${JSON.stringify(ddbResponse)}`);


    } catch (e) {
        const error = e as Error;

        if ('ConditionalCheckFailedException' == error.name) {
            logger.warn(`Counter for ${stepFunctionArn} already exists`);
        } else {
            logger.error(`Error: ${error}`);
            return {
                itemIdentifier: record.messageId,
            };

        }

    }
    return undefined;
}

async function incrementCounter(stepFunctionArn: string, record: SQSRecord, aws: AwsApiCalls): Promise<SQSBatchItemFailure | undefined> {
    let failure = await insertCounter(stepFunctionArn, record, aws);
    if (failure != undefined) {
        return failure;
    }
    try {
        logger.info('Attempting to increment lock');

        const ddbResponse = await aws.updateItem({
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
            ReturnValues: 'UPDATED_NEW',
        });
        logger.info(`Lock incremented: ${JSON.stringify(ddbResponse)}`);


    } catch (e) {
        const error = e as Error;
        logger.error(`Error: ${error}`);
        if ('ConditionalCheckFailedException' == error.name) {
            return {
                itemIdentifier: record.messageId,
            };
        }

    }
    return undefined;
}

export const onEvent = middy(onEventHandler)
    .use(captureLambdaHandler(tracer))
    .use(logMetrics(metrics, { captureColdStartMetric: true }));
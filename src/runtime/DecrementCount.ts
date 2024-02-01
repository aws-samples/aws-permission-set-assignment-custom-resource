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
import { Context, SNSEvent } from 'aws-lambda';
import { Aws, AwsApiCalls } from './Aws';

const logger = new Logger({
    serviceName: 'DecrementCount',
});
const metrics = new Metrics({
    namespace: process.env.METRIC_NAMESPACE!,
    serviceName: 'DecrementCount',
});
const tracer = new Tracer({
    serviceName: 'DecrementCount',
    enabled: true,
    captureHTTPsRequests: true,
});

export const onEventHandler = async (
    event: SNSEvent,
    //@ts-ignore
    _context: Context,
    //@ts-ignore
    _callback: Callback,
    aws: AwsApiCalls = Aws.instance({}, tracer),
): Promise<{ [name: string]: string | number | undefined }> => {
    logger.info(`"Event: ${JSON.stringify(event)}`);
    for (const record of event.Records) {
        const body = JSON.parse(record.Sns.Message);
        const status = body.status as string;
        const stepFunctionArn = process.env.STATE_MACHINE_ARN;
        if (stepFunctionArn != null) {
            try {
                await aws.updateItem({
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
                            N: '-1',
                        },
                        ':ONE': {
                            N: '1',
                        },
                    },
                    ConditionExpression: '#c >= :ONE',
                });
                if ('SUCCEEDED' != status ) {
                    try {
                        if('true' == process.env.REQUEUE_ON_FAILURE) {
                            await aws.sendMessage(
                                {
                                    QueueUrl: process.env.QUEUE_URL,
                                    MessageBody: JSON.stringify(body),
                                    MessageGroupId: 'PermissionSetAssignmentProvider',
                                });
                        }else{
                            await aws.sendMessage(
                                {
                                    QueueUrl: process.env.DLQ_URL,
                                    MessageBody: JSON.stringify(body),
                                    MessageGroupId: 'PermissionSetAssignmentProvider',
                                });
                        }

                    } catch (e1) {
                        const error1 = e1 as Error;
                        logger.error(`Error returning message to queue : ${error1}`);
                    }
                }
            } catch (e) {
                const error = e as Error;
                logger.error(`Error: ${error}`);
            }
        } else {
            throw new Error('No step function arn provided');
        }
    }

    return {};
};

export const onEvent = middy(onEventHandler)
    .use(captureLambdaHandler(tracer))
    .use(logMetrics(metrics, { captureColdStartMetric: true }));

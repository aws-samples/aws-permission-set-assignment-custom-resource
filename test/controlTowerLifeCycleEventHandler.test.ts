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

import { BatchGetItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { Aws } from '../src/aws';
import { onUpdateManagedAccount } from '../src/controlTowerLifeCycleEventHandler';


test.skip('Test create permission set assignment', async () => {
  const dynamoDbMockClient = mockClient(DynamoDBClient);
  dynamoDbMockClient.on(BatchGetItemCommand).resolves({
    Responses: {
      test:
                [
                  {
                    stackIds:
                            {
                              SS:
                                    [
                                      'arn:aws:cloudformation:us-east-2:123345678910:stack/StackSet-CustomControlTower-sandbox-developer' +
                                      '-assigments-9c2e4e5c-0965-4b38-8430-ac34d23f8b78/82507010-a3d3-11ed-ae2d-063ab0ac32b7',
                                      'arn:aws:cloudformation:us-east-2:123345678910:stack/TestPermissionSets/06f56790-a3ce-11ed-86dc-02eb77c808b4',
                                    ],
                            },
                    target_arn:
                            {
                              S: 'arn:aws:organizations::012345678901:ou/o-rlcvejgy5g/ou-0v3b-emvezkoj',
                            },
                    pk:
                            {
                              S: 'ou-0v3b-emvezkoj',
                            },
                    target_name:
                            {
                              S: 'Sandbox',
                            },
                  },
                ],
    },
  });
  const event = {
    'version': '0',
    'id': '106c6cef-2d1c-f08c-8b1b-02d5e6b1c33c',
    'detail-type': 'AWS Service Event via CloudTrail',
    'source': 'aws.controltower',
    'account': '012345678901',
    'time': '2023-02-06T15:35:37Z',
    'region': 'us-east-2',
    'resources':
            [],
    'detail':
            {
              eventVersion: '1.08',
              userIdentity:
                    {
                      accountId: '012345678901',
                      invokedBy: 'AWS Internal',
                    },
              eventTime: '2023-02-06T15:35:37Z',
              eventSource: 'controltower.amazonaws.com',
              eventName: 'UpdateManagedAccount',
              awsRegion: 'us-east-2',
              sourceIPAddress: 'AWS Internal',
              userAgent: 'AWS Internal',
              requestParameters: null,
              responseElements: null,
              eventID: '7fd5fb9f-f30b-472f-a765-333c85837d4e',
              readOnly: false,
              eventType: 'AwsServiceEvent',
              managementEvent: true,
              recipientAccountId: '012345678901',
              serviceEventDetails:
                    {
                      updateManagedAccountStatus:
                            {
                              organizationalUnit:
                                    {
                                      organizationalUnitName: 'Sandbox',
                                      organizationalUnitId: 'ou-0v3b-emvezkoj',
                                    },
                              account:
                                    {
                                      accountName: 'awsgalen-ct-personal',
                                      accountId: '123345678910',
                                    },
                              state: 'SUCCEEDED',
                              message: 'AWS Control Tower successfully updated an enrolled account.',
                              requestedTimestamp: '2023-02-06T15:12:54+0000',
                              completedTimestamp: '2023-02-06T15:35:37+0000',
                            },
                    },
              eventCategory: 'Management',
            },
  };
  const aws = new Aws({}, process.env.TABLE_NAME!, { ddbClient: dynamoDbMockClient });
  //@ts-ignore
  const callback = (error, result) => {
    return;
  };

  await onUpdateManagedAccount(event, {} as Context, callback, aws);

});
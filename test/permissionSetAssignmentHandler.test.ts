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


import { CdkCustomResourceEvent, Context } from 'aws-lambda';
import { onEvent } from '../src/permissionSetAssignmentHandler';

test.skip('Handle dot notated organizational unit name', async () => {
  const event: CdkCustomResourceEvent = {
    RequestType: 'Create',
    ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permissionSetAssignmentProvider',
    ResponseURL: 'https://cloudformation-custom-resource-response-useast2.s3.us-east-2.amazonaws.com/arn%3Aaws%3Acloudformation%3' +
        'Aus-east-2%3A123456789012%3Astack/PostgresAdminDatabaseAdministrator/c6374d90-a6e8-11ed-aab8-02c7470abf54%7C' +
        'PermissionSetAssignment%7C5ed91724-40ab-40fa-aa76-09648a863e99?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date' +
        '=20230207T131025Z&X-Amz-SignedHeaders=host&X-Amz-Expires=7200&X-Amz-Credential=ABC%2F' +
        'us-east-2%2Fs3%2Faws4_request&X-Amz-Signature=0208660e692ef0b1a4b1a1d3c4882afa090ceb9aa802fe4965e0d092f1863d90',
    StackId: 'arn:aws:cloudformation:us-east-2:123456789012:stack/PostgresAdminDatabaseAdministrator/c6374d90-a6e8-11ed-aab8-02c7470abf54',
    RequestId: '5ed91724-40ab-40fa-aa76-09648a863e99',
    LogicalResourceId: 'PermissionSetAssignment',
    ResourceType: 'AWS::CloudFormation::CustomResource',
    ResourceProperties:
            {
              ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permissionSetAssignmentProvider',
              TargetOrganizationalUnitNames:
                    [
                      'Infrastructure.prod',
                    ],
              GroupNames:
                    [
                      'PostgresAdmin',
                    ],
              PermissionSetNames:
                    [
                      'DatabaseAdministrator',
                    ],
              ForceUpdate:
                    [
                      '',
                    ],
            },
  };
  const response = await onEvent(event, {} as Context);
  expect(response.Failed).toBeFalsy();
});

test('Test create permission set assignment', async () => {
  const event: CdkCustomResourceEvent = {
    RequestType: 'Create',
    ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permission-set-assignment-permissionsetassignmentp-nbyPv6ZT29mH',
    ResponseURL: '...',
    StackId: 'arn:aws:cloudformation:us-east-2:123456789012:stack/TestPermissionSetAssignment/8331d3e0-9d87-11ed-bc20-025c9e5ac756',
    RequestId: '10ca95b2-659c-4acc-8fd5-372b30360863',
    LogicalResourceId: 'HelpDeskAssignments',
    ResourceType: 'AWS::CloudFormation::CustomResource',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permission-set-assignment-permissionsetassignmentp-nbyPv6ZT29mH',
      TargetOrganizationalUnitNames: [
        'Sandbox',
      ],
      GroupNames: [
        'Developers',
        'HelpDesk',
      ],
      PermissionSetNames: [
        'S3ReadOnlyPerson',
      ],
    },
  };
  const response = await onEvent(event, {} as Context);
  expect(response.Failed).toBeFalsy();
});

test.skip('Test update permission set assignement', async () => {
  const event: CdkCustomResourceEvent = {
    RequestType: 'Update',
    ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permission-set-assignment-provider',
    ResponseURL: 'https://cloudformation-custom-resource-response-useast2.s3.us-east-2.amazonaws.com/arn%3Aaws%3Acloudformation%3' +
        'Aus-east-2%3A123456789012%3Astack/TestPermissionSets/45993130-a170-11ed-9fd3-0adf13893686%7CPermissionSetAssignment%7' +
        'C0045cdfe-37de-4538-8774-7003e9e448b5?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20230131T140938Z&X-Amz-SignedHeaders=host' +
        '&X-Amz-Expires=7200&X-Amz-Credential=ABC%2F20230131%2Fus-east-2%2Fs3%2Faws4_request&' +
        'X-Amz-Signature=57b091283218b8c1cad597d1eb1c7ffe33f49ef0b27fe9629191477cc8b75f11',
    StackId: 'arn:aws:cloudformation:us-east-2:123456789012:stack/TestPermissionSets/45993130-a170-11ed-9fd3-0adf13893686',
    RequestId: '0045cdfe-37de-4538-8774-7003e9e448b5',
    LogicalResourceId: 'PermissionSetAssignment',
    PhysicalResourceId: 'cf641190-a461-4029-aba8-2288cc4d1124',
    ResourceType: 'AWS::CloudFormation::CustomResource',
    ResourceProperties:
            {
              ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permission-set-assignment-provider',
              TargetOrganizationalUnitNames:
                    [
                      'Sandbox',
                    ],
              GroupNames:
                    [
                      'Developers',
                    ],
              PermissionSetNames:
                    [
                      'S3ReadOnlyPerson',
                    ],
            },
    OldResourceProperties:
            {
              ServiceToken: 'arn:aws:lambda:us-east-2:123456789012:function:permission-set-assignment-provider',
              TargetOrganizationalUnitNames:
                    [
                      'Sandbox',
                    ],
              GroupNames:
                    [
                      'Developers',
                      'HelpDesk',
                    ],
              PermissionSetNames:
                    [
                      'S3ReadOnlyPerson',
                    ],
            },
  };
  await onEvent(event, {} as Context);
});



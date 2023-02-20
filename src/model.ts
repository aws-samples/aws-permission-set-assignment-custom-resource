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

import { Account, OrganizationalUnit } from '@aws-sdk/client-organizations';
import { CreateAccountAssignmentCommandInput, DeleteAccountAssignmentCommandInput } from '@aws-sdk/client-sso-admin';
import { Callback } from 'aws-lambda';

export interface PermissionSetAssignmentProperties {
  TargetOrganizationalUnitNames: string[] | undefined;
  GroupNames: string[] | undefined;
  UserNames: string[] | undefined;
  PermissionSetNames: string[] | undefined;
  TargetAccountIds: string[] | undefined;

}

export type Target = OrganizationalUnit | Account

export interface TargetOperation {
  target:Target;
  type: AssignmentPayloadType;
}


export interface AccountAssignmentInputs {
  targetIds: string[];
  groupIds: string[];
  userIds: string[];
  permissionSetArns: string[];

  targets:Target[];

}

export type AccountAssignmentCommandInputType = CreateAccountAssignmentCommandInput | DeleteAccountAssignmentCommandInput

export interface AccountAssignmentCommandInput {
  input: AccountAssignmentCommandInputType;
  type: AssignmentPayloadType;
}

export enum AssignmentPayloadType {
  CREATE = 'Create',

  DELETE = 'Delete',


}

export type AccountAssignmentsExecutionStatus = {
  status?: string;
  error?: string;

  cause?: string;
}


//@ts-ignore
export const defaultCallback: Callback<void> = (error?: Error | string | null, result?: void) => void {};

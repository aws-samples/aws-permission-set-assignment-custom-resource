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

import { PermissionSetAssignmentProperties } from '../src/model';
import { PermissionSetAssignmentPropertiesDiff } from '../src/PermissionSetAssignmentPropertiesDiff';


describe('Test GroupNames', () => {
  test('Remove GroupName', function () {
    const oldProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const newProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const results = new PermissionSetAssignmentPropertiesDiff(newProps, oldProps);
    const adds = results.results.adds;
    const removes = results.results.removes;
    expect(adds.length).toBe(0);
    expect(removes.length).toBe(1);
    expect(removes[0].GroupNames).toEqual(['HelpDesk']);

  });
  test('Add GroupName', function () {
    const newProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk', 'SRE'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const oldProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const results = new PermissionSetAssignmentPropertiesDiff(newProps, oldProps);
    const adds = results.results.adds;
    const removes = results.results.removes;
    expect(adds.length).toBe(2);
    expect(removes.length).toBe(0);
    expect(adds[0].GroupNames).toEqual(['HelpDesk']);
    expect(adds[1].GroupNames).toEqual(['SRE']);
  });
  test('Update GroupName', function () {
    const newProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk', 'Admins'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const oldProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk', 'SRE'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const results = new PermissionSetAssignmentPropertiesDiff(newProps, oldProps);
    const adds = results.results.adds;
    const removes = results.results.removes;
    expect(adds.length).toBe(1);
    expect(removes.length).toBe(1);
    expect(adds[0].GroupNames).toEqual(['Admins']);
    expect(removes[0].GroupNames).toEqual(['SRE']);
  });

});

describe('Test PermissionSetNames', () => {
  test('Remove PermissionSetName', function () {
    const oldProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const newProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk'],
      PermissionSetNames: [],
      UserNames: undefined,
    };
    const results = new PermissionSetAssignmentPropertiesDiff(newProps, oldProps);
    const adds = results.results.adds;
    const removes = results.results.removes;
    expect(adds.length).toBe(0);
    expect(removes.length).toBe(1);
    expect(removes[0].PermissionSetNames).toEqual(['S3ReadOnlyPerson']);

  });
  test('Add PermissionSetName', function () {
    const newProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk', 'SRE'],
      PermissionSetNames: ['S3ReadOnlyPerson'],
      UserNames: undefined,
    };
    const oldProps: PermissionSetAssignmentProperties = {
      TargetAccountIds: undefined,
      TargetOrganizationalUnitNames: ['Sandbox'],
      GroupNames: ['Developers', 'HelpDesk', 'SRE'],
      PermissionSetNames: [],
      UserNames: undefined,
    };
    const results = new PermissionSetAssignmentPropertiesDiff(newProps, oldProps);
    const adds = results.results.adds;
    const removes = results.results.removes;
    expect(adds.length).toBe(1);
    expect(removes.length).toBe(0);
    expect(adds[0].PermissionSetNames).toEqual(['S3ReadOnlyPerson']);
  });

});



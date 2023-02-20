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

import { PermissionSetAssignmentProperties } from './model';

export interface DiffResults {
  readonly adds: PermissionSetAssignmentProperties[];
  readonly removes: PermissionSetAssignmentProperties[];
}

export class PermissionSetAssignmentPropertiesDiff {

  private readonly newProps: PermissionSetAssignmentProperties;
  private readonly oldProps: PermissionSetAssignmentProperties;

  readonly results: DiffResults;


  constructor(newProps: PermissionSetAssignmentProperties, oldProps: PermissionSetAssignmentProperties) {
    this.newProps = newProps;
    this.oldProps = oldProps;
    this.results = this.diff();

  }

  isEmpty(): boolean {
    return this.results.adds.length == 0 && this.results.removes.length == 0;
  }

  private diff(): DiffResults {
    const adds: PermissionSetAssignmentProperties[] = [];
    const removes: PermissionSetAssignmentProperties[] = [];
    const targetOrganizationalUnitNames = this.diffForField('TargetOrganizationalUnitNames', (value, props) => {
      return {
        TargetOrganizationalUnitNames: value,
        PermissionSetNames: props.PermissionSetNames,
        UserNames: props.UserNames,
        GroupNames: props.GroupNames,
        TargetAccountIds: [],
      };
    });
    adds.push(...targetOrganizationalUnitNames.adds);
    removes.push(...targetOrganizationalUnitNames.removes);
    const permissionSetNames = this.diffForField('PermissionSetNames', (value, props) => {
      return {
        TargetOrganizationalUnitNames: props.TargetOrganizationalUnitNames,
        PermissionSetNames: value,
        UserNames: props.UserNames,
        GroupNames: props.GroupNames,
        TargetAccountIds: props.TargetAccountIds,
      };
    });
    adds.push(...permissionSetNames.adds);
    removes.push(...permissionSetNames.removes);
    const groupNames = this.diffForField('GroupNames', (value, props) => {
      return {
        TargetOrganizationalUnitNames: props.TargetOrganizationalUnitNames,
        PermissionSetNames: props.PermissionSetNames,
        UserNames: [],
        GroupNames: value,
        TargetAccountIds: props.TargetAccountIds,
      };
    });
    adds.push(...groupNames.adds);
    removes.push(...groupNames.removes);

    const userNames = this.diffForField('UserNames', (value, props) => {
      return {
        TargetOrganizationalUnitNames: props.TargetOrganizationalUnitNames,
        PermissionSetNames: props.PermissionSetNames,
        UserNames: value,
        GroupNames: [],
        TargetAccountIds: props.TargetAccountIds,
      };
    });
    adds.push(...userNames.adds);
    removes.push(...userNames.removes);
    const targetAccountIds = this.diffForField('TargetAccountIds', (value, props) => {
      return {
        TargetOrganizationalUnitNames: [],
        PermissionSetNames: props.PermissionSetNames,
        UserNames: props.UserNames,
        GroupNames: props.GroupNames,
        TargetAccountIds: value,
      };
    });
    adds.push(...targetAccountIds.adds);
    removes.push(...targetAccountIds.removes);
    return {
      adds: adds,
      removes: removes,
    };

  };

  private diffForField(fieldName: string, callback: (value: string[],
    props: PermissionSetAssignmentProperties) => PermissionSetAssignmentProperties): DiffResults {
    const adds: PermissionSetAssignmentProperties[] = [];
    const removes: PermissionSetAssignmentProperties[] = [];

    //@ts-ignore
    if (this.oldProps[fieldName] != undefined) {
      //@ts-ignore
      if (this.newProps[fieldName] != undefined) {
        //@ts-ignore
        for (const oldValue of this.oldProps[fieldName]) {
          //@ts-ignore
          if (this.newProps[fieldName].indexOf(oldValue) == -1) {
            removes.push(callback([oldValue], this.oldProps));
          }
        }
        //@ts-ignore
        for (const newValue of this.newProps[fieldName]) {
          //@ts-ignore
          if (this.oldProps[fieldName].indexOf(newValue) == -1) {
            adds.push(callback([newValue], this.newProps));
          }
        }
      } else {
        //@ts-ignore
        removes.push(callback(oldProps[fieldName], this.oldProps));
      }
      //@ts-ignore
    } else if (this.newProps[fieldName] != undefined) {
      //the old props didn't have the field name but the new props do so add them all
      //@ts-ignore
      adds.push(callback(this.newProps[fieldName], this.newProps));
    }
    return {
      adds: adds,
      removes: removes,
    };


  }

}
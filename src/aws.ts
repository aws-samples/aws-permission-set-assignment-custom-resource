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

import { randomUUID } from 'crypto';
import { Logger } from '@aws-lambda-powertools/logger';
import {
  CloudFormationClient,
  GetTemplateCommand,
  paginateDescribeStacks,
  Parameter,
  UpdateStackCommand,
  UpdateStackCommandOutput,
} from '@aws-sdk/client-cloudformation';
import {
  BatchGetItemCommand,
  DeleteItemCommand,
  DeleteItemCommandOutput,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  PutItemCommandOutput,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandOutput,
  UpdateItemCommand,
  UpdateItemCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { KeysAndAttributes, TransactWriteItem } from '@aws-sdk/client-dynamodb/dist-types/models/models_0';
import { Group, IdentitystoreClient, paginateListGroups, paginateListUsers, User } from '@aws-sdk/client-identitystore';
import {
  Account,
  DescribeAccountCommand,
  DescribeOrganizationalUnitCommand,
  DescribeOrganizationCommand,
  Organization,
  OrganizationalUnit,
  OrganizationsClient,
  paginateListAccounts,
  paginateListAccountsForParent,
  paginateListOrganizationalUnitsForParent,
  paginateListRoots,
  Root,
} from '@aws-sdk/client-organizations';

import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  DescribePermissionSetCommand,
  InstanceMetadata,
  ListInstancesCommand,
  paginateListPermissionSets,
  PermissionSet,
  PrincipalType,
  SSOAdminClient,
  TargetType,
} from '@aws-sdk/client-sso-admin';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import {
  AccountAssignmentCommandInput,
  AccountAssignmentInputs,
  AccountAssignmentsExecutionStatus,
  AssignmentPayloadType,
  PermissionSetAssignmentProperties,
  Target,
  TargetOperation,
} from './model';

const logger = new Logger({ serviceName: 'Aws' });

export class Aws {

  // @ts-ignore
  protected readonly configuration: object;

  private readonly organizationsClient: OrganizationsClient;
  private readonly ssoAdminClient: SSOAdminClient;
  private readonly identityStoreClient: IdentitystoreClient;
  private readonly sfnClient: SFNClient;
  private readonly ddbClient: DynamoDBClient;
  private readonly cfmClient: CloudFormationClient;
  protected accountsByOrganizationalUnit: Map<OrganizationalUnit, Account[]>;
  protected organizationalUnits: OrganizationalUnit[] | undefined;
  protected groups: Group[] | undefined;

  protected users: User[] | undefined;
  protected root: Root | undefined;

  protected organization: Organization | undefined;
  protected identityStoreMetaData: InstanceMetadata | undefined;

  protected permissionSets: PermissionSet[] | undefined;
  private readonly tableName: string;

  public constructor(configuration: object = {}, tableName: string | undefined = process.env.TABLE_NAME, kwargs: Record<string, any> = {}) {

    if (tableName == undefined) {
      throw new Error('No table name specified');
    }
    this.tableName = tableName;
    this.accountsByOrganizationalUnit = new Map<OrganizationalUnit, Account[]>();
    this.configuration = configuration;
    this.organizationsClient = new OrganizationsClient(configuration);
    this.ssoAdminClient = new SSOAdminClient(configuration);
    this.identityStoreClient = new IdentitystoreClient(configuration);
    this.sfnClient = new SFNClient(configuration);
    this.ddbClient = kwargs != undefined && 'ddbClient' in kwargs ? kwargs.ddbClient as DynamoDBClient : new DynamoDBClient(configuration);
    this.cfmClient = new CloudFormationClient(configuration);
  }

  //TODO: This needs to be moved to a state machine
  async rerunPermissionSetAssignmentStack(stackId: string): Promise<UpdateStackCommandOutput[]> {
    const paginator = paginateDescribeStacks({
      client: this.cfmClient,
    }, {
      StackName: stackId,
    });
    const results: UpdateStackCommandOutput[] = [];
    for await (const page of paginator) {
      // page contains a single paginated output.
      if (page.Stacks != undefined) {
        for (const stack of page.Stacks) {
          try {
            const parameters = stack.Parameters;

            if (parameters != undefined) {
              const updatedParameters: Parameter[] = parameters.map(value => {
                const param: Parameter = {
                  ParameterKey: value.ParameterKey,

                };
                if (value.ParameterKey != 'ForceUpdate') {
                  param.UsePreviousValue = true;
                }
                return param;

              });
              const forceUpdate: Parameter | undefined = updatedParameters.find(value => {
                return value.ParameterKey == 'ForceUpdate';
              });
              if (forceUpdate == undefined) {
                logger.debug('Parameter \'ForceUpdate\' not found, adding');
                updatedParameters.push({
                  ParameterKey: 'ForceUpdate',
                  ParameterValue: randomUUID(),
                });
              } else {
                forceUpdate.ParameterValue = randomUUID();
              }
              const templateBody = await this.cfmClient.send(new GetTemplateCommand({
                StackName: stackId,
              }));
              logger.debug(`Rerunning stack ${stackId} with parameters ${JSON.stringify(updatedParameters)}`);
              const update = await this.cfmClient.send(new UpdateStackCommand({
                StackName: stackId,
                Parameters: updatedParameters,
                TemplateBody: templateBody.TemplateBody,
              }));
              results.push(update);
            } else {
              logger.warn(`Could not get parameters for stack ${stackId} `);
            }
          } catch (e: any) {
            const error = e as Error;
            logger.error(`${error.name}: ${error.message} - ${error.stack}`);

          }

        }
      } else {
        logger.warn(`Could not find stack with stackId: ${stackId}`);
      }
    }
    return results;


  }

  async getIdentityStoreInstanceMetadata(): Promise<InstanceMetadata> {
    if (this.identityStoreMetaData == undefined) {
      const response = await this.ssoAdminClient.send(new ListInstancesCommand({}));
      if (response.Instances != undefined && response.Instances.length > 0) {
        this.identityStoreMetaData = response.Instances[0];
      } else {
        throw new Error('Could not retrieve identity store id');
      }
    }
    return this.identityStoreMetaData;
  }

  async getRoot(): Promise<Root> {
    if (this.root == undefined) {
      const paginator = paginateListRoots({
        client: this.organizationsClient,
      }, {});
      for await (const page of paginator) {
        // page contains a single paginated output.
        if (page.Roots != undefined) {
          this.root = page.Roots[0];
        } else {
          throw new Error('Could not get organization root');
        }
      }
    }
    return this.root!;
  }

  async getOrganization(): Promise<Organization> {
    if (this.organization == undefined) {
      const response = await this.organizationsClient.send(new DescribeOrganizationCommand({}));
      if (response.Organization != undefined) {
        this.organization = response.Organization;
      }
    }
    return this.organization!;
  }

  async listAccountsForOrganizationalUnit(organizationalUnit: OrganizationalUnit): Promise<Account[]> {
    if (this.accountsByOrganizationalUnit.has(organizationalUnit)) {
      return this.accountsByOrganizationalUnit.get(organizationalUnit)!;
    } else {
      const accounts: Account[] = [];
      let paginator;
      if (organizationalUnit.Id!.startsWith('r-')) {
        paginator = paginateListAccounts({
          client: this.organizationsClient,
        }, {});
      } else {
        paginator = paginateListAccountsForParent({
          client: this.organizationsClient,
        }, {
          ParentId: organizationalUnit.Id,
        });
      }
      for await (const page of paginator) {
        // page contains a single paginated output.
        if (page.Accounts != undefined) {
          accounts.push(...page.Accounts);
        }
      }
      this.accountsByOrganizationalUnit.set(organizationalUnit, accounts);
      return accounts;
    }
  }


  async getGroupsByName(names: string[]): Promise<Group[]> {
    const groups = await this.listGroups();
    return groups.filter(value => {
      return (value.DisplayName != undefined && names.indexOf(value.DisplayName) != -1);
    });
  }

  async listGroups(): Promise<Group[]> {
    if (this.groups == undefined) {
      this.groups = [];
      const metadata = await this.getIdentityStoreInstanceMetadata();
      const paginator = paginateListGroups({
        client: this.identityStoreClient,
      }, {
        IdentityStoreId: metadata.IdentityStoreId,
      });
      for await (const page of paginator) {
        // page contains a single paginated output.
        if (page.Groups != undefined) {
          this.groups.push(...page.Groups);
        }
      }
    }
    return this.groups;
  }

  async getUsersByName(names: string[]): Promise<User[]> {
    const users = await this.listUsers();
    return users.filter(value => {
      return (value.UserName != undefined && names.indexOf(value.UserName) != -1);
    });
  }

  async listUsers(): Promise<User[]> {
    if (this.users == undefined) {
      this.users = [];
      const metadata = await this.getIdentityStoreInstanceMetadata();
      const paginator = paginateListUsers({
        client: this.identityStoreClient,
      }, {
        IdentityStoreId: metadata.IdentityStoreId,
      });
      for await (const page of paginator) {
        // page contains a single paginated output.
        if (page.Users != undefined) {
          this.users.push(...page.Users);
        }
      }
    }
    return this.users;
  }

  async getPermissionSetsByName(names: string[]): Promise<PermissionSet[]> {
    const permissionSets = await this.listPermissionSet();
    return permissionSets.filter(value => {
      return (value.Name != undefined && names.indexOf(value.Name) != -1);
    });
  }

  async listPermissionSet(): Promise<PermissionSet[]> {
    if (this.permissionSets == undefined) {
      this.permissionSets = [];
      const metadata = await this.getIdentityStoreInstanceMetadata();
      const paginator = paginateListPermissionSets({
        client: this.ssoAdminClient,
      }, {
        InstanceArn: metadata.InstanceArn,
      });
      for await (const page of paginator) {

        // page contains a single paginated output.
        if (page.PermissionSets != undefined) {
          for (const permissionSetArn of page.PermissionSets) {
            const response = await this.ssoAdminClient.send(new DescribePermissionSetCommand({
              PermissionSetArn: permissionSetArn,
              InstanceArn: metadata.InstanceArn,
            }));
            if (response.PermissionSet != undefined) {
              this.permissionSets.push(response.PermissionSet);
            }
          }
        }
      }
    }
    return this.permissionSets;
  }

  async startAccountAssignmentsExecution(stateMachineArn: string, inputs: AccountAssignmentCommandInput[]): Promise<string> {

    const response = await this.sfnClient.send(new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      input: JSON.stringify({
        inputs: inputs,
      }),
    }));
    if (response.executionArn == undefined) {
      throw new Error('Could not start create account assignment execution');
    }
    return response.executionArn;
  }

  async getAccountAssignmentsExecutionStatus(executionArn: string): Promise<AccountAssignmentsExecutionStatus> {
    const response = await this.sfnClient.send(new DescribeExecutionCommand({
      executionArn: executionArn,
    }));
    logger.debug(`getAccountAssignmentsExecutionStatus = ${JSON.stringify(response)}`);
    return {
      status: response.status,
      error: response.error,
      cause: response.cause,
    };
  }

  async accountAssignmentInputs(properties: PermissionSetAssignmentProperties): Promise<AccountAssignmentInputs> {
    const targetIds: string[] = properties.TargetAccountIds != undefined ? [...properties.TargetAccountIds] : [];
    const groupIds: string[] = [];
    const userIds: string[] = [];
    const permissionSetArns: string[] = [];
    const targets: Target[] = [];
    const organization = await this.getOrganization();
    const managementAccountId = organization.MasterAccountId;
    if (properties.TargetAccountIds != undefined) {
      const targetAccountIds: string[] = properties.TargetAccountIds;
      const targetAccounts = await this.mapAccountIdsToTargets(targetAccountIds);
      for (const account of targetAccounts) {
        if (account.Id != undefined && account.Id != managementAccountId) {
          targetIds.push(account.Id);
          targets.push(account);
        }
      }

    }
    //get all the accounts for each listed ou
    if (properties.TargetOrganizationalUnitNames != undefined) {
      const targetOrganizationalUnitNames: string[] = properties.TargetOrganizationalUnitNames;
      const organizationalUnits = await this.mapOrganizationalUnitNamesToTargets(targetOrganizationalUnitNames);
      for (const organizationalUnit of organizationalUnits) {
        const accounts = await this.listAccountsForOrganizationalUnit(organizationalUnit);
        for (const account of accounts) {
          if (account.Id != undefined && account.Id != managementAccountId) {
            targetIds.push(account.Id);

          }

        }
        targets.push(organizationalUnit);
      }
    }
    if (properties.GroupNames != undefined) {
      const groups = await this.getGroupsByName(properties.GroupNames);
      for (const group of groups) {
        if (group.GroupId != undefined) {
          groupIds.push(group.GroupId);
        }
      }
    }
    if (properties.UserNames != undefined) {
      const users = await this.getUsersByName(properties.UserNames);
      for (const user of users) {
        if (user.UserId != undefined) {
          userIds.push(user.UserId);
        }
      }
    }
    if (properties.PermissionSetNames != undefined) {
      const permissionSets = await this.getPermissionSetsByName(properties.PermissionSetNames);
      for (const permissionSet of permissionSets) {
        if (permissionSet.PermissionSetArn != undefined) {
          permissionSetArns.push(permissionSet.PermissionSetArn);
        }
      }
    }
    const instanceMetadata = await this.getIdentityStoreInstanceMetadata();
    if (instanceMetadata.InstanceArn == undefined) {
      throw new Error('Could not retrieve identity store instance arn');
    }
    if (groupIds.length == 0 && userIds.length == 0) {
      throw new Error('No principal ids specified');
    }
    if (targetIds.length == 0) {
      logger.warn('No target ids specified');
    }
    if (permissionSetArns.length == 0) {
      throw new Error('No permission sets specified');
    }
    //use converted sets here to eliminate duplicate values
    return {
      groupIds: Array.from(new Set<string>(groupIds)),
      permissionSetArns: Array.from(new Set<string>(permissionSetArns)),
      targetIds: Array.from(new Set<string>(targetIds)),
      userIds: Array.from(new Set<string>(userIds)),
      targets: targets,
    };
  }


  async accountAssignmentCommandInputs(type: AssignmentPayloadType, properties: PermissionSetAssignmentProperties):
  Promise<[AccountAssignmentCommandInput[], TargetOperation[]]> {
    const accountAssignmentInputs = await this.accountAssignmentInputs(properties);
    const inputs: AccountAssignmentCommandInput[] = [];
    const instanceMetadata = await this.getIdentityStoreInstanceMetadata();
    inputs.push(...this.mapAccountAssignmentCommandInput(type, accountAssignmentInputs.groupIds, PrincipalType.GROUP, instanceMetadata.InstanceArn!,
      accountAssignmentInputs.permissionSetArns, accountAssignmentInputs.targetIds));
    inputs.push(...this.mapAccountAssignmentCommandInput(type, accountAssignmentInputs.userIds, PrincipalType.USER, instanceMetadata.InstanceArn!,
      accountAssignmentInputs.permissionSetArns, accountAssignmentInputs.targetIds));
    return [inputs, accountAssignmentInputs.targets.map(value => {
      return {
        target: value,
        type: type,
      };
    })];
  };


  private mapAccountAssignmentCommandInput(type: AssignmentPayloadType, principalIds: string[], principalType: PrincipalType, instanceArn: string,
    permissionSetArns: string[], targetIds: string[]): AccountAssignmentCommandInput[] {
    const results: AccountAssignmentCommandInput[] = [];
    for (const principalId of principalIds) {
      for (const permissionSetArn of permissionSetArns) {
        for (const targetId of targetIds) {
          results.push({
            input: {
              PermissionSetArn: permissionSetArn,
              InstanceArn: instanceArn,
              PrincipalId: principalId,
              TargetType: TargetType.AWS_ACCOUNT,
              PrincipalType: principalType,
              TargetId: targetId,
            },
            type: type,
          });
        }
      }

    }
    return results;
  }

  async putExecutionRecord(physicalResourceId: string, executionArn: string): Promise<PutItemCommandOutput> {
    const item = {
      pk: physicalResourceId,
      executionArn: executionArn,
    };
    return this.ddbClient.send(new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item),
    }));
  }

  async getStackAssociations(organizationalUnit: OrganizationalUnit, account: Account): Promise<Record<string, any>[]> {
    const requestItems: Record<string, KeysAndAttributes> = {};
    const root = await this.getRoot();
    requestItems[this.tableName] = {
      Keys: [{

        pk: { S: organizationalUnit.Id! },
      }, {

        pk: { S: account.Id! },
      }, {
        pk: { S: root.Id! },
      }],

    };
    const responses = await this.ddbClient.send(new BatchGetItemCommand({
      RequestItems: requestItems,
    }));
    const results: Record<string, any>[] = [];
    if (responses.Responses != undefined && responses.Responses[this.tableName]) {
      for (const response of responses.Responses[this.tableName]) {
        const unmarshalledResponse = unmarshall(response);
        results.push({
          pk: unmarshalledResponse.pk,
          target_name: unmarshalledResponse.target_name,
          target_arn: unmarshalledResponse.target_arn,
          stackIds: Array.from(unmarshalledResponse.stackIds),
        });
      }
    } else {
      logger.info(`No associations for organizationalUnit ${JSON.stringify(organizationalUnit)} or account ${JSON.stringify(account)}`);
    }
    return results;

  }

  async mapOrganizationalUnitNamesToTargets(names: string[]): Promise<Target[]> {
    const results: Target[] = [];
    for (const name of names) {
      const t = await this.resolveOrganizationalUnit(name);
      if (t != undefined) {
        results.push(t);
      }
    }
    return results;
  }

  async mapAccountIdsToTargets(accountIds: string[]): Promise<Target[]> {
    const results: Target[] = [];
    for (const accountId of accountIds) {
      const response = await this.organizationsClient.send(new DescribeAccountCommand({
        AccountId: accountId,
      }));
      if (response.Account != undefined) {
        results.push(response.Account);

      } else {
        logger.warn(`Could not find account with id ${accountId}`);
      }
    }
    return results;
  }

  async resolveOrganizationalUnit(name: string, parentOrganizationalUnitId: string | undefined = undefined): Promise<Target | undefined> {
    const nameParts = name.split('.');
    if (nameParts.length > 1) {
      //it's dot notated
      const namePart = nameParts[0];
      const organizationalUnit = await this.resolveOrganizationalUnit(namePart, parentOrganizationalUnitId);
      if (organizationalUnit != undefined) {
        const re = new RegExp(`${namePart}\.?`, 'g');
        const remainingName = name.replace(re, '');
        if (remainingName.length > 0) {
          return this.resolveOrganizationalUnit(remainingName, organizationalUnit.Id);
        } else {
          return organizationalUnit;
        }
      } else {
        logger.warn(`Could not find organizational unit for ${name}`);
        return undefined;
      }

    } else {

      if (name.startsWith('r-') || name.toLowerCase() == 'root') {
        return this.getRoot();
      } else if (name.startsWith('ou-')) {
        //it's an ou id
        const response = await this.organizationsClient.send(new DescribeOrganizationalUnitCommand({
          OrganizationalUnitId: name,
        }));
        if (response.OrganizationalUnit != undefined) {
          return response.OrganizationalUnit;
        } else {
          return undefined;
        }
      } else {
        //it's an ou id
        if (parentOrganizationalUnitId == undefined) {
          const root = await this.getRoot();
          parentOrganizationalUnitId = root.Id;
        }

        const paginator = paginateListOrganizationalUnitsForParent({
          client: this.organizationsClient,
        }, {
          ParentId: parentOrganizationalUnitId,
        });
        let result: OrganizationalUnit | undefined;
        for await (const page of paginator) {
          // page contains a single paginated output.
          if (page.OrganizationalUnits != undefined) {
            result = page.OrganizationalUnits.find(value => {
              return value.Name == name;
            });
            if (result != undefined) {
              break;
            }
          }
        }
        if (result != undefined) {
          return result;
        } else {
          logger.warn(`Could not find organizational unit for ${name}`);
          return undefined;
        }


      }
    }
  }

  async associateTargetsToStack(stackId: string, targetOperations: TargetOperation[]): Promise<TransactWriteItemsCommandOutput | undefined> {
    const statements: TransactWriteItem[] = [];
    for (const targetOperation of targetOperations) {
      const key = {
        pk: {
          S: targetOperation.target.Id!,
        },

      };
      const expressionAttributeValues = {
        ':stackId': {
          SS: [stackId],
        },
        ':target_arn': {
          S: targetOperation.target.Arn!,
        },
        ':target_name': {
          S: targetOperation.target.Name!,
        },
      };
      const expression = `${targetOperation.type == AssignmentPayloadType.CREATE ? 'ADD' : 'DELETE'} stackIds :stackId SET target_arn=:target_arn,\
       target_name=:target_name`;
      statements.push({

        Update: {
          Key: key,
          TableName: this.tableName,
          UpdateExpression: expression,
          ExpressionAttributeValues: expressionAttributeValues,
        },
      });

    }

    let response: TransactWriteItemsCommandOutput | undefined = undefined;
    logger.debug(`Statement:${JSON.stringify(statements)}`);
    if (statements.length > 0) {
      response = await this.ddbClient.send(new TransactWriteItemsCommand({
        TransactItems: statements,
      }));

    }
    return response;

  }

  async associateStackToAccountId(accountId: string, stackId: string): Promise<UpdateItemCommandOutput> {
    const key = {
      pk: accountId,

    };
    return this.ddbClient.send(new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall(key),
      UpdateExpression: 'SET stackIds = list_append(stackIds,:i)',
      ExpressionAttributeValues: {
        ':i': {
          L: [{ S: stackId }],
        },
      },
    }));
  }

  async deleteExecutionRecord(physicalResourceId: string): Promise<DeleteItemCommandOutput> {
    const key = {
      pk: physicalResourceId,

    };
    return this.ddbClient.send(new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall(key),
    }));
  }

  async getExecutionArnFromPhysicalResourceId(physicalResourceId: string): Promise<string> {
    const key = {
      pk: physicalResourceId,

    };
    const response = await this.ddbClient.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall(key),
    }));
    if (response.Item != undefined) {
      return unmarshall(response.Item).executionArn;
    } else {
      throw new Error(`Could not find execution arn for physical resource id: ${physicalResourceId} `);
    }
  }


}

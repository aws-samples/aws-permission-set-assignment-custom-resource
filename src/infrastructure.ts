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

import path from 'path';
import { paginateListInstances, SSOAdminClient } from '@aws-sdk/client-sso-admin';
import { App, Aspects, Aws as AWS, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { EventBus as EventBusTarget, LambdaFunction as LambdaFunctionTarget } from 'aws-cdk-lib/aws-events-targets';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ParameterDataType, StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  Choice,
  Condition,
  CustomState, DefinitionBody,
  Fail,
  LogLevel,
  Map,
  Pass,
  StateMachine,
  StateMachineType,
  Succeed,
  Wait,
  WaitTime,
} from 'aws-cdk-lib/aws-stepfunctions';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

export interface PermissionSetAssignmentConfig {
  table: Table;
  instanceId: string;
  managementAccountId: string;
}

export class PermissionSetAssignment extends Construct {
  readonly serviceTokenParameter: StringParameter;


  constructor(scope: Construct, id: string, config: PermissionSetAssignmentConfig) {
    super(scope, id);
    const stateMachine = this.buildStateMachine(config.instanceId);
    const table = config.table;
    const permissionSetAssignmentHandler = new NodejsFunction(this, 'permissionSetAssignmentHandler', {
      handler: 'onEvent',
      entry: path.join(__dirname, 'permissionSetAssignmentHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_18_X,
      logRetention: RetentionDays.ONE_DAY,
      reservedConcurrentExecutions: 1,
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },

    });
    table.grantWriteData(permissionSetAssignmentHandler);
    const isCompleteHandler = new NodejsFunction(this, 'permissionSetAssignmentIsCompleteHandler', {
      handler: 'isComplete',
      entry: path.join(__dirname, 'isCompleteHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_18_X,
      logRetention: RetentionDays.ONE_DAY,
      reservedConcurrentExecutions: 1,
      environment: {
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },

    });
    table.grantReadWriteData(isCompleteHandler);
    stateMachine.grantStartExecution(permissionSetAssignmentHandler);
    stateMachine.grantRead(isCompleteHandler);

    stateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['events:PutTargets', 'events:PutRule', 'events:DescribeRule'],
      resources: [`arn:${AWS.PARTITION}:events:${AWS.REGION}:${AWS.ACCOUNT_ID}:rule/StepFunctionsGetEventsForStepFunctionsExecutionRule`],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['organizations:ListAccounts',
        'organizations:ListRoots', 'organizations:DescribeOrganization'],
      resources: ['*'],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['organizations:ListAccountsForParent', 'organizations:DescribeOrganizationalUnit', 'organizations:ListOrganizationalUnitsForParent'],
      resources: [`arn:aws:organizations::${config.managementAccountId}:ou/o-*/ou-*`,
        `arn:aws:organizations::${config.managementAccountId}:root/o-*/r-*`],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sso:ListInstances'],
      resources: ['*'],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sso:ListPermissionSets'],
      resources: [`arn:aws:sso:::instance/${config.instanceId}`],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sso:DescribePermissionSet'],
      resources: [`arn:aws:sso:::instance/${config.instanceId}`, `arn:aws:sso:::permissionSet/${config.instanceId}/*`],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['identitystore:ListGroups', 'identitystore:ListUsers'],
      resources: ['*'],
    }));
    permissionSetAssignmentHandler.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['organizations:DescribeAccount'],
      resources: ['*'],
    }));

    const permissionSetAssignmentProvider = new Provider(this, 'permissionSetAssignmentProvider', {
      onEventHandler: permissionSetAssignmentHandler,
      logRetention: RetentionDays.ONE_DAY,
      isCompleteHandler: isCompleteHandler,
      providerFunctionName: 'permissionSetAssignmentProvider',

    });

    this.serviceTokenParameter = new StringParameter(this, 'permissionSetAssignmentProviderServiceTokenParameter', {
      dataType: ParameterDataType.TEXT,
      description: 'The service token for the permission set assignment provider',
      parameterName: '/cfn/custom/PermissionSetAssignmentProvider/ServiceToken',
      stringValue: permissionSetAssignmentProvider.serviceToken,
    });
    new CfnOutput(this, 'permissionSetAssignmentProviderOutput', {
      value: this.serviceTokenParameter.parameterName,
      description: 'SSM Parameter key where the service provider token is stored',
    });

  }

  private buildDeleteAccountAssignmentStateMachine(): StateMachine {
    const start = new Pass(this, 'startDeleteAccountAssignmentStateMachine', {
      outputPath: '$.Payload',
    });
    const deleteAccountAssignmentTask = new CustomState(this, 'deleteAccountAssignmentTask', {
      stateJson: {
        Type: 'Task',
        Parameters: {
          'InstanceArn.$': '$.InstanceArn',
          'PermissionSetArn.$': '$.PermissionSetArn',
          'PrincipalId.$': '$.PrincipalId',
          'PrincipalType.$': '$.PrincipalType',
          'TargetId.$': '$.TargetId',
          'TargetType.$': '$.TargetType',
        },
        ResultPath: '$.TaskResult',
        Resource: 'arn:aws:states:::aws-sdk:ssoadmin:deleteAccountAssignment',
      },
    });
    start.next(deleteAccountAssignmentTask);
    const waitForDelete = new Wait(this, 'waitForDeleteAccountAssignmentTask', {
      time: WaitTime.duration(Duration.seconds(10)),
    });
    deleteAccountAssignmentTask.next(waitForDelete);
    const describeAccountAssignmentDeletionStatus = new CustomState(this, 'describeAccountAssignmentDeletionStatus', {
      stateJson: {
        Type: 'Task',
        Comment: 'Get status of account assignment deletion',
        Parameters: {
          'AccountAssignmentDeletionRequestId.$': '$.TaskResult.AccountAssignmentDeletionStatus.RequestId',
          'InstanceArn.$': '$.InstanceArn',
        },
        ResultPath: '$.TaskResult',
        Resource: 'arn:aws:states:::aws-sdk:ssoadmin:describeAccountAssignmentDeletionStatus',


      },

    });
    waitForDelete.next(describeAccountAssignmentDeletionStatus);
    const isAccountAssignmentDeletionComplete = new Choice(this, 'isAccountAssignmentDeletionComplete', {});
    describeAccountAssignmentDeletionStatus.next(isAccountAssignmentDeletionComplete);
    const accountAssignmentDeletionSucceeded = new Succeed(this, 'accountAssignmentDeletionSucceeded', {
      comment: 'Account Assignment Deletion Succeeded',
    });
    const accountAssignmentDeletionFailed = new Fail(this, 'accountAssignmentDeletionFailed', {
      comment: 'Account Assignment Deletion Failed',
    });
    isAccountAssignmentDeletionComplete.otherwise(waitForDelete);
    isAccountAssignmentDeletionComplete.when(Condition.or(Condition.stringEquals('$.TaskResult.AccountAssignmentDeletionStatus.Status',
      'SUCCEEDED'), Condition.and(Condition.stringEquals('$.TaskResult.AccountAssignmentDeletionStatus.Status', 'FAILED'),
      Condition.stringMatches('$.TaskResult.AccountAssignmentDeletionStatus.FailureReason', 'Received a 404 status error:*'))),
    accountAssignmentDeletionSucceeded);
    isAccountAssignmentDeletionComplete.when(Condition.stringEquals('$.TaskResult.AccountAssignmentDeletionStatus.Status', 'FAILED'),
      accountAssignmentDeletionFailed);

    const logGroup = new LogGroup(this, 'deleteAccountAssignmentStateMachineLogGroup', {
      logGroupName: 'deleteAccountAssignmentStateMachine',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.THREE_DAYS,
    });
    const stateMachine = new StateMachine(this, 'deleteAccountAssignmentStateMachine', {
      stateMachineName: 'deleteAccountAssignmentStateMachine',
      stateMachineType: StateMachineType.EXPRESS,
      tracingEnabled: true,
      definitionBody: DefinitionBody.fromChainable(start),
      timeout: Duration.minutes(60),
      logs: {
        destination: logGroup,
        includeExecutionData: true,
        level: LogLevel.ALL,
      },
    });


    return stateMachine;
  }


  private buildCreateAccountAssignmentStateMachine(): StateMachine {
    const start = new Pass(this, 'startCreateAccountAssignmentStateMachine', {
      outputPath: '$.Payload',
    });
    const createAccountAssignmentTask = new CustomState(this, 'createAccountAssignmentTask', {
      stateJson: {
        Type: 'Task',
        Parameters: {
          'InstanceArn.$': '$.InstanceArn',
          'PermissionSetArn.$': '$.PermissionSetArn',
          'PrincipalId.$': '$.PrincipalId',
          'PrincipalType.$': '$.PrincipalType',
          'TargetId.$': '$.TargetId',
          'TargetType.$': '$.TargetType',
        },
        ResultPath: '$.TaskResult',
        ResultSelector: {
          'RequestId.$': '$.AccountAssignmentCreationStatus.RequestId',
          'Status.$': '$.AccountAssignmentCreationStatus.Status',
        },
        Resource: 'arn:aws:states:::aws-sdk:ssoadmin:createAccountAssignment',
      },
    });

    start.next(createAccountAssignmentTask);
    const waitForCreate = new Wait(this, 'waitForCreateAccountAssignmentTask', {
      time: WaitTime.duration(Duration.seconds(10)),
    });

    createAccountAssignmentTask.next(waitForCreate);
    const describeAccountAssignmentCreationStatus = new CustomState(this, 'describeAccountAssignmentCreationStatusTask', {
      stateJson: {
        Type: 'Task',
        Comment: 'Get status of create account assignment',
        Parameters: {
          'AccountAssignmentCreationRequestId.$': '$.TaskResult.RequestId',
          'InstanceArn.$': '$.InstanceArn',
        },
        Resource: 'arn:aws:states:::aws-sdk:ssoadmin:describeAccountAssignmentCreationStatus',
        ResultPath: '$.TaskResult',
        ResultSelector: {
          'RequestId.$': '$.AccountAssignmentCreationStatus.RequestId',
          'Status.$': '$.AccountAssignmentCreationStatus.Status',
        },
      },


    });
    waitForCreate.next(describeAccountAssignmentCreationStatus);
    const isAccountAssignmentCreationComplete = new Choice(this, 'isAccountAssignmentCreationComplete', {});
    describeAccountAssignmentCreationStatus.next(isAccountAssignmentCreationComplete);
    const accountAssignmentCreationSucceeded = new Succeed(this, 'accountAssignmentCreationSucceeded', {
      comment: 'Account Assignment Creation Succeeded',
    });
    const accountAssignmentCreationFailed = new Fail(this, 'accountAssignmentCreationFailed', {
      comment: 'Account Assignment Creation Failed',
    });
    isAccountAssignmentCreationComplete.otherwise(waitForCreate);
    isAccountAssignmentCreationComplete.when(Condition.stringEquals('$.TaskResult.Status', 'SUCCEEDED'),
      accountAssignmentCreationSucceeded);
    isAccountAssignmentCreationComplete.when(Condition.stringEquals('$.TaskResult.Status', 'FAILED'), accountAssignmentCreationFailed);
    const logGroup = new LogGroup(this, 'createAccountAssignmentStateMachineLogGroup', {
      logGroupName: 'createAccountAssignmentStateMachine',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.THREE_DAYS,
    });
    const stateMachine = new StateMachine(this, 'createAccountAssignmentStateMachine', {
      stateMachineName: 'createAccountAssignmentStateMachine',
      stateMachineType: StateMachineType.EXPRESS,
      tracingEnabled: true,
      definitionBody: DefinitionBody.fromChainable(start),
      timeout: Duration.minutes(60),
      logs: {
        destination: logGroup,
        includeExecutionData: true,
        level: LogLevel.ALL,
      },
    });

    return stateMachine;
  }

  private buildStateMachine(instanceId: string): StateMachine {
    const createAccountAssignmentStateMachine = this.buildCreateAccountAssignmentStateMachine();
    const deleteAccountAssignmentStateMachine = this.buildDeleteAccountAssignmentStateMachine();
    const start = new Pass(this, 'start', {});
    const map = new Map(this, 'map', {
      maxConcurrency: 5,
      itemsPath: '$.inputs',
    });
    start.next(map);
    const requestTypeChoice = new Choice(this, 'requestTypeChoice', {});
    map.iterator(requestTypeChoice);

    const executeCreateAccountAssignment = new CustomState(this, 'executeCreateAccountAssignment', {
      stateJson: {
        Type: 'Task',
        Parameters: {
          StateMachineArn: createAccountAssignmentStateMachine.stateMachineArn,
          Input: {
            'Payload': {
              'InstanceArn.$': '$.input.InstanceArn',
              'PermissionSetArn.$': '$.input.PermissionSetArn',
              'PrincipalId.$': '$.input.PrincipalId',
              'PrincipalType.$': '$.input.PrincipalType',
              'TargetId.$': '$.input.TargetId',
              'TargetType.$': '$.input.TargetType',
            },
            'AWS_STEP_FUNCTIONS_STARTED_BY_EXECUTION_ID.$': '$$.Execution.Id',
          },
        },
        Resource: 'arn:aws:states:::states:startExecution.sync:2',
      },
    });
    const executeDeleteAccountAssignment = new CustomState(this, 'executeDeleteAccountAssignment', {
      stateJson: {
        Type: 'Task',
        Parameters: {
          StateMachineArn: deleteAccountAssignmentStateMachine.stateMachineArn,
          Input: {
            'Payload': {
              'InstanceArn.$': '$.input.InstanceArn',
              'PermissionSetArn.$': '$.input.PermissionSetArn',
              'PrincipalId.$': '$.input.PrincipalId',
              'PrincipalType.$': '$.input.PrincipalType',
              'TargetId.$': '$.input.TargetId',
              'TargetType.$': '$.input.TargetType',
            },
            'AWS_STEP_FUNCTIONS_STARTED_BY_EXECUTION_ID.$': '$$.Execution.Id',
          },
        },
        Resource: 'arn:aws:states:::states:startExecution.sync:2',
      },
    });


    requestTypeChoice.when(Condition.stringEquals('$.type', 'Create'), executeCreateAccountAssignment);
    requestTypeChoice.when(Condition.stringEquals('$.type', 'Delete'), executeDeleteAccountAssignment);


    const stateMachine = new StateMachine(this, 'assignPermissionSetsStateMachine', {
      stateMachineName: 'assignPermissionSetsStateMachine',
      stateMachineType: StateMachineType.STANDARD,
      tracingEnabled: true,
      definitionBody: DefinitionBody.fromChainable(start),
      timeout: Duration.hours(6),
    });

    createAccountAssignmentStateMachine.grantRead(stateMachine);
    createAccountAssignmentStateMachine.grantStartExecution(stateMachine);
    createAccountAssignmentStateMachine.grantStartSyncExecution(stateMachine);
    createAccountAssignmentStateMachine.grantTaskResponse(stateMachine);
    createAccountAssignmentStateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['organizations:ListRoots'],
      resources: ['*'],
    }));
    createAccountAssignmentStateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sso:CreateAccountAssignment'],
      resources: [`arn:aws:sso:::instance/${instanceId}`, `arn:aws:sso:::permissionSet/${instanceId}/*`,
        'arn:aws:sso:::account/*'],
    }));
    createAccountAssignmentStateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sso:DescribeAccountAssignmentCreationStatus'],
      resources: [`arn:aws:sso:::instance/${instanceId}`],
    }));


    deleteAccountAssignmentStateMachine.grantRead(stateMachine);
    deleteAccountAssignmentStateMachine.grantStartExecution(stateMachine);
    deleteAccountAssignmentStateMachine.grantStartSyncExecution(stateMachine);
    deleteAccountAssignmentStateMachine.grantTaskResponse(stateMachine);
    deleteAccountAssignmentStateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['organizations:ListRoots'],
      resources: ['*'],
    }));
    deleteAccountAssignmentStateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sso:DeleteAccountAssignment', 'sso:DescribeAccountAssignmentDeletionStatus'],
      resources: [`arn:aws:sso:::instance/${instanceId}`, `arn:aws:sso:::permissionSet/${instanceId}/*`,
        'arn:aws:sso:::account/*'],
    }));
    return stateMachine;
  }
}

export interface PermissionSetAssignmentCustomResourceStackProps extends StackProps {
  managementAccountId: string;
  instanceId: string;
}

export class PermissionSetAssignmentCustomResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: PermissionSetAssignmentCustomResourceStackProps) {
    super(scope, id, props);
    const table = new Table(this, 'AssignPermissionSetsTable', {
      partitionKey: {
        name: 'pk',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
    });
    const permissionSetAssignment = new PermissionSetAssignment(this, 'PermissionSetAssignment', {
      table: table,
      instanceId: props.instanceId,
      managementAccountId: props.managementAccountId,
    });
    new ControlTowerLifeCycleEvent(this, 'ControlTowerLifeCycleEvent', {
      table: table,
      managementAccountId: props.managementAccountId,
      serviceTokenParameter: permissionSetAssignment.serviceTokenParameter,

    });
    const awsSolutionsIAM4Response = 'AWS managed policies acceptable here';
    const awsSolutionsIAM5Response = 'The actions in this policy do not support resource-level permissions and require All resources';
    const awsSolutionsL1Response = 'provider-framework hardcoded with NodeJS 14x https://github.com/aws/aws-cdk/blob/686c72d8f7e347053cb47153c1a98b1bef1a29e3/packages/%40aws-cdk/custom-resources/lib/provider-framework/provider.ts#L210';
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/createAccountAssignmentStateMachine/Role/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/deleteAccountAssignmentStateMachine/Role/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/assignPermissionSetsStateMachine/Role/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/permissionSetAssignmentHandler/ServiceRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/permissionSetAssignmentIsCompleteHandler/ServiceRole/DefaultPolicy' +
            '/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/permissionSetAssignmentProvider/framework-onEvent/ServiceRole' +
            '/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this,
      '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment/permissionSetAssignmentProvider/framework-isComplete/ServiceRole' +
            '/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: awsSolutionsIAM5Response,
        },
      ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-onTimeout/ServiceRole/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: awsSolutionsIAM5Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/waiter-state-machine/Role/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: awsSolutionsIAM5Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack' +
            '/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: awsSolutionsIAM5Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/ControlTowerLifeCycleEvent' +
            '/onUpdateManagedAccountHandler/ServiceRole/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: awsSolutionsIAM5Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/ControlTowerLifeCycleEvent' +
            '/onCreateManagedAccountHandler/ServiceRole/DefaultPolicy/Resource', [
      {
        id: 'AwsSolutions-IAM5',
        reason: awsSolutionsIAM5Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/assignPermissionSetsStateMachine/Resource', [
      {
        id: 'AwsSolutions-SF1',
        reason: '"ALL" events is an overkill here',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentHandler/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentIsCompleteHandler/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-onEvent/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-isComplete/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-onTimeout/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack' +
            '/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/ControlTowerLifeCycleEvent' +
            '/onUpdateManagedAccountHandler/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/ControlTowerLifeCycleEvent' +
            '/onCreateManagedAccountHandler/ServiceRole/Resource', [
      {
        id: 'AwsSolutions-IAM4',
        reason: awsSolutionsIAM4Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-onEvent/Resource', [
      {
        id: 'AwsSolutions-L1',
        reason: awsSolutionsL1Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-isComplete/Resource', [
      {
        id: 'AwsSolutions-L1',
        reason: awsSolutionsL1Response,
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, '/PermissionSetAssignmentCustomResourceStack/PermissionSetAssignment' +
            '/permissionSetAssignmentProvider/framework-onTimeout/Resource', [
      {
        id: 'AwsSolutions-L1',
        reason: awsSolutionsL1Response,
      },
    ]);


  }
}

export interface ControlTowerLifeCycleEventProps {
  managementAccountId: string;
  table: Table;
  serviceTokenParameter: StringParameter;

}

export class ControlTowerLifeCycleEvent extends Construct {
  constructor(scope: Construct, id: string, props: ControlTowerLifeCycleEventProps) {
    super(scope, id);
    const eventBus = new EventBus(this, 'EventBus', {
      eventBusName: 'ControlTowerLifeCycleEventBus',
    });
    const table = props.table;
    eventBus.addToResourcePolicy(new PolicyStatement({
      sid: 'AllowLifeCycleEventsFromManagementAccount',
      effect: Effect.ALLOW,
      actions: ['events:PutEvents'],
      principals: [new AccountPrincipal(props.managementAccountId)],
      resources: [eventBus.eventBusArn],

    }));
    const onUpdateManagedAccountHandler = new NodejsFunction(this, 'onUpdateManagedAccountHandler', {
      handler: 'onUpdateManagedAccount',
      entry: path.join(__dirname, 'controlTowerLifeCycleEventHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_18_X,
      logRetention: RetentionDays.ONE_DAY,
      environment: {
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },
    });
    table.grantReadData(onUpdateManagedAccountHandler);
    const onCreateManagedAccountHandler = new NodejsFunction(this, 'onCreateManagedAccountHandler', {
      handler: 'onCreateManagedAccount',
      entry: path.join(__dirname, 'controlTowerLifeCycleEventHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_18_X,
      logRetention: RetentionDays.ONE_DAY,
      environment: {
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },

    });
    table.grantReadData(onCreateManagedAccountHandler);
    const updateStackPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['cloudformation:UpdateStack', 'cloudformation:DescribeStacks', 'cloudformation:GetTemplate'],
      resources: ['*'],
    });
    const listRootsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['organizations:ListRoots'],
      resources: ['*'],
    });
    const invokeProviderPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [`arn:aws:lambda:${AWS.REGION}:${AWS.ACCOUNT_ID}:function:permissionSetAssignmentProvider`],
    });
    props.serviceTokenParameter.grantRead(onUpdateManagedAccountHandler);
    props.serviceTokenParameter.grantRead(onCreateManagedAccountHandler);
    onUpdateManagedAccountHandler.addToRolePolicy(listRootsPolicy);
    onCreateManagedAccountHandler.addToRolePolicy(listRootsPolicy);
    onUpdateManagedAccountHandler.addToRolePolicy(updateStackPolicy);
    onCreateManagedAccountHandler.addToRolePolicy(updateStackPolicy);
    onUpdateManagedAccountHandler.addToRolePolicy(invokeProviderPolicy);
    onCreateManagedAccountHandler.addToRolePolicy(invokeProviderPolicy);


    new Rule(this, 'onControlTowerLifecycleEventCreateManagedAccountSuccess', {
      eventBus: eventBus,
      ruleName: 'onControlTowerLifecycleEventCreateManagedAccountSuccess',
      eventPattern: {
        detailType: ['AWS Service Event via CloudTrail'],
        source: ['aws.controltower'],
        detail: {
          serviceEventDetails: {
            createManagedAccountStatus: {
              state: ['SUCCEEDED'],
            },
          },
          eventName: ['CreateManagedAccount'],
        },
      },
      targets: [new LambdaFunctionTarget(onCreateManagedAccountHandler)],

    });
    new Rule(this, 'onControlTowerLifecycleEventUpdateManagedAccountSuccess', {
      eventBus: eventBus,
      ruleName: 'onControlTowerLifecycleEventUpdateManagedAccountSuccess',
      eventPattern: {
        detailType: ['AWS Service Event via CloudTrail'],
        source: ['aws.controltower'],
        detail: {
          serviceEventDetails: {
            updateManagedAccountStatus: {
              state: ['SUCCEEDED'],
            },
          },
          eventName: ['UpdateManagedAccount'],
        },
      },
      targets: [new LambdaFunctionTarget(onUpdateManagedAccountHandler)],

    });
    new CfnOutput(this, 'controlTowerLifeCycleTargetEventBusArnOutput', {
      value: eventBus.eventBusArn,
      description: 'Arn of the target event bus',
    });
  }
}

export interface ControlTowerLifeCycleEventSourceRuleStackProps extends StackProps {
  targetEventBusArn: string;
}

export class ControlTowerLifeCycleEventSourceRuleStack extends Stack {
  constructor(scope: Construct, id: string, props: ControlTowerLifeCycleEventSourceRuleStackProps) {
    super(scope, id, props);
    const targetEventBus = new EventBusTarget(EventBus.fromEventBusArn(this, 'targetEventBus', props.targetEventBusArn));
    const sourceEventBus = EventBus.fromEventBusName(this, 'sourceEventBus', 'default');
    new Rule(this, 'onControlTowerLifecycleEventCreateManagedAccountSuccess', {
      eventBus: sourceEventBus,
      ruleName: 'onControlTowerLifecycleEventCreateManagedAccountSuccess',
      eventPattern: {
        detailType: ['AWS Service Event via CloudTrail'],
        source: ['aws.controltower'],
        detail: {
          serviceEventDetails: {
            createManagedAccountStatus: {
              state: ['SUCCEEDED'],
            },
          },
          eventName: ['CreateManagedAccount'],
        },
      },
      targets: [targetEventBus],

    });
    new Rule(this, 'onControlTowerLifecycleEventUpdateManagedAccountSuccess', {
      eventBus: sourceEventBus,
      ruleName: 'onControlTowerLifecycleEventUpdateManagedAccountSuccess',
      eventPattern: {
        detailType: ['AWS Service Event via CloudTrail'],
        source: ['aws.controltower'],
        detail: {
          serviceEventDetails: {
            updateManagedAccountStatus: {
              state: ['SUCCEEDED'],
            },
          },
          eventName: ['UpdateManagedAccount'],
        },
      },
      targets: [targetEventBus],

    });

  }
}

// for development, use account/region from cdk cli
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};
(async () => {
  const app = new App();

  const managementAccountId = app.node.tryGetContext('managementAccountId');
  if (managementAccountId != undefined) {
    let instanceId = app.node.tryGetContext('instanceId');
    if (instanceId == undefined) {
      console.log('No IAM Identity Center instance id specified in context, attempting to look up instance id via api');
      const client = new SSOAdminClient({ region: env.region });
      const paginator = paginateListInstances({
        client: client,
      }, {});
      for await (const page of paginator) {
        if (instanceId != undefined) {
          throw new Error('More than one IAM Identity Center instance found, I\'m not sure which one to choose');
        }
        if (page.Instances != undefined && page.Instances.length == 1 && page.Instances[0].InstanceArn != undefined) {
          instanceId = page.Instances[0].InstanceArn;
          const split_instance_id = instanceId.split('/');
          instanceId = split_instance_id[split_instance_id.length - 1];

        } else {
          throw new Error('Could not lookup IAM Identity Center instance');
        }
      }
      console.log(`Found IAM Identity Center instance id: ${instanceId}`);
    }
    new PermissionSetAssignmentCustomResourceStack(app, 'PermissionSetAssignmentCustomResourceStack', {
      env: env,
      managementAccountId: managementAccountId,
      instanceId: instanceId,

    });
  }
  const targetEventBusArn = app.node.tryGetContext('targetEventBusArn');
  if (targetEventBusArn != undefined) {
    new ControlTowerLifeCycleEventSourceRuleStack(app, 'ControlTowerLifeCycleEventSourceRuleStack', {
      env: env,
      targetEventBusArn: targetEventBusArn,
    });
  }
  Aspects.of(app).add(new AwsSolutionsChecks({ reports: true }));

  app.synth();
})().then(_value => {
  console.log('Success');
}).catch(reason => {
  console.error(`There was a problem with deployment ${reason}`);
});;


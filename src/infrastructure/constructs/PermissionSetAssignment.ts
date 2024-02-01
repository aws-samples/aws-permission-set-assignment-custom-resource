import path from 'path';
import { Aws as AWS, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ParameterDataType, StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  Choice,
  Condition,
  CustomState,
  DefinitionBody,
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
import { Construct } from 'constructs';
import { AwsStateMachineWithConcurrencyControls } from './StateMachineWithConcurrencyControls';

export interface PermissionSetAssignmentConfig {
  table: Table;
  instanceId: string;
  managementAccountId: string;
  maxConcurrentExecutions: number;
  requeueOnFailure: boolean;
}
export class PermissionSetAssignment extends Construct {
  readonly serviceTokenParameter: StringParameter;


  constructor(scope: Construct, id: string, config: PermissionSetAssignmentConfig) {
    super(scope, id);
    const stateMachine = this.buildStateMachine(config.instanceId);
    const table = config.table;
    const eventBus =EventBus.fromEventBusName(this,'eventBus', 'default');
    const stateMachineWithConcurrencyControls = new AwsStateMachineWithConcurrencyControls(this, 'StateMachineConcurrencyControls', {
      concurrencyTable: table,
      eventBus: eventBus,
      maxConcurrentExecutions: config.maxConcurrentExecutions,
      requeueOnFailure: config.requeueOnFailure,
      stateMachine: stateMachine,
    });
    const permissionSetAssignmentHandlerLogGroup = new LogGroup(this, 'permissionSetAssignmentHandlerLogGroup', {
      retention: RetentionDays.ONE_DAY,
    });
    const permissionSetAssignmentHandler = new NodejsFunction(this, 'permissionSetAssignmentHandler', {
      description: 'permissionSetAssignmentHandler.ts',
      handler: 'index.onEvent',
      entry: path.join(__dirname, '..', '..', 'runtime', 'permissionSetAssignmentHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_20_X,
      logGroup: permissionSetAssignmentHandlerLogGroup,
      reservedConcurrentExecutions: 1,
      environment: {
        QUEUE_URL: stateMachineWithConcurrencyControls.queue.queueUrl,
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },
      tracing: Tracing.ACTIVE,
    });
    stateMachineWithConcurrencyControls.queue.grantSendMessages(permissionSetAssignmentHandler);
    table.grantWriteData(permissionSetAssignmentHandler);


    stateMachine.grantStartExecution(permissionSetAssignmentHandler);


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

    const logGroup = new LogGroup(this, 'DeleteAccountAssignmentStateMachineLogGroup', {
      logGroupName: 'DeleteAccountAssignmentStateMachine',
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.THREE_DAYS,
    });
    return new StateMachine(this, 'deleteAccountAssignmentStateMachine', {
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
    const logGroup = new LogGroup(this, 'CreateAccountAssignmentStateMachineLogGroup', {
      logGroupName: 'CreateAccountAssignmentStateMachine',
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

    const logGroup = new LogGroup(this, 'AssignPermissionSetsStateMachineLogGroup', {
      retention: RetentionDays.ONE_MONTH,
    });
    const stateMachine = new StateMachine(this, 'assignPermissionSetsStateMachine', {
      stateMachineName: 'assignPermissionSetsStateMachine',
      stateMachineType: StateMachineType.STANDARD,
      logs: {
        destination: logGroup,
        level: LogLevel.ALL,
      },
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
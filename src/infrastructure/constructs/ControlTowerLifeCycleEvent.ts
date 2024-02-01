import path from 'path';
import { Aws as AWS, CfnOutput, Duration } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction as LambdaFunctionTarget } from 'aws-cdk-lib/aws-events-targets';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

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
    const onUpdateManagedAccountHandlerLogGroup = new LogGroup(this, 'onUpdateManagedAccountHandlerLogGroup', {
      retention: RetentionDays.ONE_DAY,
    });
    const onUpdateManagedAccountHandler = new NodejsFunction(this, 'onUpdateManagedAccountHandler', {
      description: 'onUpdateManagedAccountHandler.ts',
      handler: 'index.onEvent',
      entry: path.join(__dirname, '..', '..', 'runtime', 'controlTowerLifeCycleEventHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_20_X,
      logGroup: onUpdateManagedAccountHandlerLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },
      tracing: Tracing.ACTIVE,
    });
    table.grantReadData(onUpdateManagedAccountHandler);
    const onCreateManagedAccountHandlerLogGroup = new LogGroup(this, 'onCreateManagedAccountHandlerLogGroup', {
      retention: RetentionDays.ONE_DAY,
    });
    const onCreateManagedAccountHandler = new NodejsFunction(this, 'onCreateManagedAccountHandler', {
      description: 'onCreateManagedAccountHandler.ts',
      handler: 'index.onEvent',
      entry: path.join(__dirname, '..', '..', 'runtime', 'controlTowerLifeCycleEventHandler.ts'),
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_20_X,
      logGroup: onCreateManagedAccountHandlerLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'DEBUG',
      },
      tracing: Tracing.ACTIVE,
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
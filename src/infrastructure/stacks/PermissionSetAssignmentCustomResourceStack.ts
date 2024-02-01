import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { ControlTowerLifeCycleEvent } from '../constructs/ControlTowerLifeCycleEvent';
import { PermissionSetAssignment } from '../constructs/PermissionSetAssignment';


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
      maxConcurrentExecutions:1,
      requeueOnFailure:false
    });
    new ControlTowerLifeCycleEvent(this, 'ControlTowerLifeCycleEvent', {
      table: table,
      managementAccountId: props.managementAccountId,
      serviceTokenParameter: permissionSetAssignment.serviceTokenParameter,
    });
    const awsSolutionsIAM4Response = 'AWS managed policies acceptable here';
    const awsSolutionsIAM5Response = 'The actions in this policy do not support resource-level permissions and require All resources';
    const awsSolutionsL1Response = 'provider-framework hardcoded with NodeJS 14x https://github.com/aws/aws-cdk/blob/686c72d8f7e347053cb47153c1a98b1bef1a29e3/packages/%40aws-cdk/custom-resources/lib/provider-framework/provider.ts#L210';
    NagSuppressions.addStackSuppressions(this, [{
      id: 'AwsSolutions-IAM5',
      reason: awsSolutionsIAM5Response,
    }, {
      id: 'AwsSolutions-IAM4',
      reason: awsSolutionsIAM4Response,
    }, {
      id: 'AwsSolutions-L1',
      reason: awsSolutionsL1Response,
    }, {
      id: 'AwsSolutions-SNS2',
      reason: awsSolutionsL1Response,
    }]);


  }
}
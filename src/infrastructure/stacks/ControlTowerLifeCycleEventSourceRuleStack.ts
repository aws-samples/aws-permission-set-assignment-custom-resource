import { Stack, StackProps } from 'aws-cdk-lib';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { EventBus as EventBusTarget } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';


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
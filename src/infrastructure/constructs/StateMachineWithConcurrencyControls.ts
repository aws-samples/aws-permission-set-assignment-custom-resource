/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { AttributeType, ITable, Table } from 'aws-cdk-lib/aws-dynamodb';
import { IEventBus, Rule, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SnsEventSource, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ITopic, Topic } from 'aws-cdk-lib/aws-sns';
import { FifoThroughputLimit, IQueue, Queue } from 'aws-cdk-lib/aws-sqs';
import { IStateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface AwsStateMachineWithConcurrencyControlsProps {
  // Define construct properties here
  concurrencyTable?: ITable;
  stateMachine: IStateMachine;
  requeueOnFailure: boolean;
  eventBus: IEventBus;
  maxConcurrentExecutions: number;
}

export class AwsStateMachineWithConcurrencyControls extends Construct {
  readonly queue: IQueue;
  readonly dql: IQueue;
  readonly table: ITable;
  readonly topic: ITopic;

  constructor(scope: Construct, id: string, props: AwsStateMachineWithConcurrencyControlsProps) {
    super(scope, id);
    const functionTimeoutSeconds = 30;
    this.dql = new Queue(this, 'entry-queue-dlq', {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_QUEUE,
      retentionPeriod: Duration.days(7),
      enforceSSL: true,
    });
    this.queue = new Queue(this, 'entry-queue', {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_QUEUE,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: this.dql,

      },
      enforceSSL: true,
      contentBasedDeduplication: true,
      visibilityTimeout: Duration.seconds(functionTimeoutSeconds * 6),
    });
    if (props.concurrencyTable == null) {
      props.concurrencyTable = new Table(this, 'concurrency-table', {
        partitionKey: {
          type: AttributeType.STRING,
          name: 'pk',
        },
      });
    }
    this.table = props.concurrencyTable;
    const incrementCountFunctionLogGroup = new LogGroup(this, 'IncrementCountFunctionLogGroup', {
      retention: RetentionDays.ONE_DAY,
    });
    const incrementCount = new NodejsFunction(this, 'IncrementCountFunction', {
      description: 'StateMachineConcurrencyControl increment-count-function',
      memorySize: 256,
      timeout: Duration.seconds(functionTimeoutSeconds),
      runtime: Runtime.NODEJS_LATEST,
      handler: 'index.onEvent',
      entry: path.join(__dirname, '..', '..', 'runtime', 'IncrementCount.ts'),
      logGroup: incrementCountFunctionLogGroup,

      environment: {
        TABLE_NAME: this.table.tableName,
        STATE_MACHINE_ARN: props.stateMachine.stateMachineArn,
        MAX_CONCURRENCY: `${props.maxConcurrentExecutions}`,
        QUEUE_URL: this.queue.queueUrl,
        LOG_LEVEL: 'DEBUG',
      },
      events: [
        new SqsEventSource(this.queue, {
          enabled: true,
          batchSize: 1,
          reportBatchItemFailures: true,
        }),
      ],
      reservedConcurrentExecutions: 1,
      tracing: Tracing.ACTIVE,

    });
    props.stateMachine.grantStartExecution(incrementCount);
    const decrementCountFunctionLogGroup = new LogGroup(this, 'DecrementCountFunctionLogGroup', {
      retention: RetentionDays.ONE_DAY,
    });

    const decrementCount = new NodejsFunction(this, 'DecrementCountFunction', {
      description: 'StateMachineConcurrencyControl decrement-count-function',
      memorySize: 256,
      timeout: Duration.seconds(functionTimeoutSeconds),
      runtime: Runtime.NODEJS_LATEST,
      handler: 'index.onEvent',
      entry: path.join(__dirname, '..', '..', 'runtime', 'DecrementCount.ts'),
      logGroup: decrementCountFunctionLogGroup,

      environment: {
        TABLE_NAME: this.table.tableName,
        STATE_MACHINE_ARN: props.stateMachine.stateMachineArn,
        REQUEUE_ON_FAILURE: `${props.requeueOnFailure}`,
        QUEUE_URL: this.queue.queueUrl,
        DLQ_URL: this.dql.queueUrl,
        LOG_LEVEL: 'DEBUG',
      },
      reservedConcurrentExecutions: 1,

    });
    this.dql.grantSendMessages(decrementCount);
    this.queue.grantSendMessages(decrementCount);
    this.queue.grantSendMessages(incrementCount);
    this.table.grantReadWriteData(decrementCount);
    this.table.grantReadWriteData(incrementCount);
    this.topic = new Topic(this, 'on-completed-event-topic');
    this.topic.addToResourcePolicy(new PolicyStatement({
      effect: Effect.DENY,
      actions: ['SNS:Publish'],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false',
        },
      },
      resources: [this.topic.topicArn],
      principals: [new AnyPrincipal()],
    }));
    new Rule(this, 'on-completed-event-rule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['aws.states'],
        detailType: ['Step Functions Execution Status Change'],
        detail: {
          status: ["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"],
          stateMachineArn: [props.stateMachine.stateMachineArn],
        },
      },
      targets: [new SnsTopic(this.topic, {
        message: RuleTargetInput.fromEventPath('$.detail'),
      })],
    });
    decrementCount.addEventSource(new SnsEventSource(this.topic, {}));

  }
}

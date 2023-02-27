import os

import boto3
from aws_cdk import App, Environment
from python_usage import (
    ExamplePermissionSetAssignmentsStack,
    ExamplePermissionSetsStack,
)

# for development, use account/region from cdk cli
dev_env = Environment(
    account=os.getenv("CDK_DEFAULT_ACCOUNT"), region=os.getenv("CDK_DEFAULT_REGION")
)

app = App()
instance_arn = app.node.try_get_context("instance_arn")
if instance_arn is None:
    client = boto3.client("sso-admin")
    paginator = client.get_paginator("list_instances")
    response_iterator = paginator.paginate()
    for page in response_iterator:
        for instance in page["Instances"]:
            if instance_arn is None:
                instance_arn = instance["InstanceArn"]
            else:
                raise ValueError(
                    "More than one IAM Identity Center instance found, I'm not sure which one to choose"
                )

example_permission_set_stack = ExamplePermissionSetsStack(
    app,
    "example-permission-sets-stack-dev",
    instance_arn=instance_arn,
    config_path="permission-sets.json",
    env=dev_env,
)
example_permission_set_assignment_stack = ExamplePermissionSetAssignmentsStack(
    app,
    "example-permission-set-assignments-stack-dev",
    config_path="permission-set-assignments.json",
    env=dev_env,
)
example_permission_set_assignment_stack.add_dependency(example_permission_set_stack)
app.synth()

from aws_cdk import Stack
from python_usage.constructs import PermissionSets, PermissionSetAssignments
from constructs import Construct


class ExamplePermissionSetAssignmentsStack(Stack):
    def __init__(
        self, scope: Construct, construct_id: str, config_path: str, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        PermissionSetAssignments(
            self, "example-permission-set-assignments", config_path=config_path
        )


class ExamplePermissionSetsStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        instance_arn: str,
        config_path: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        PermissionSets(
            self,
            "example-permission-sets",
            instance_arn=instance_arn,
            config_path=config_path,
        )

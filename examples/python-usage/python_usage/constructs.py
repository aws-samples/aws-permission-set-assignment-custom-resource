import json
from aws_cdk import CustomResource
from aws_cdk.aws_ssm import StringParameter
from aws_cdk.aws_sso import CfnPermissionSet
from constructs import Construct


class PermissionSetAssignments(Construct):
    def __init__(
        self, scope: Construct, construct_id: str, config_path: str, **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        service_token = StringParameter.value_for_string_parameter(
            self,
            parameter_name="/cfn/custom/PermissionSetAssignmentProvider/ServiceToken",
        )

        with open(config_path) as config_file:
            config = json.load(config_file)
            for permissionSetAssignmentJson in config["permissionSetAssignments"]:
                group_names = (
                    permissionSetAssignmentJson["GroupNames"]
                    if "GroupNames" in permissionSetAssignmentJson
                    else None
                )
                user_names = (
                    permissionSetAssignmentJson["UserNames"]
                    if "UserNames" in permissionSetAssignmentJson
                    else None
                )
                organizational_unit_names = (
                    permissionSetAssignmentJson["OrganizationalUnits"]
                    if "OrganizationalUnits" in permissionSetAssignmentJson
                    else None
                )
                target_account_ids = (
                    permissionSetAssignmentJson["AccountIds"]
                    if "AccountIds" in permissionSetAssignmentJson
                    else None
                )
                if (group_names is None or len(group_names) == 0) and (
                    user_names is None or len(user_names) == 0
                ):
                    raise Exception(
                        "You must specify at least one principal (either group or username)"
                    )
                if (
                    organizational_unit_names is None
                    or len(organizational_unit_names) == 0
                ) and (target_account_ids is None or len(target_account_ids) == 0):
                    raise Exception(
                        "You must specify at least one target (either OU or account id) "
                    )
                CustomResource(
                    self,
                    permissionSetAssignmentJson["Id"],
                    service_token=service_token,
                    properties={
                        "PermissionSetNames": permissionSetAssignmentJson[
                            "PermissionSets"
                        ],
                        "GroupNames": group_names,
                        "UserNames": user_names,
                        "TargetOrganizationalUnitNames": organizational_unit_names,
                        "TargetAccountIds": target_account_ids,
                        "ForceUpdate": None,
                    },
                )


class PermissionSets(Construct):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        instance_arn: str,
        config_path: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        with open(config_path) as config_file:
            config = json.load(config_file)
        for permissionSetJson in config["permissionSets"]:
            CfnPermissionSet(
                self,
                permissionSetJson["Id"],
                instance_arn=instance_arn,
                name=permissionSetJson["Name"],
                customer_managed_policy_references=permissionSetJson[
                    "CustomerManagedPolicyReferences"
                ]
                if "CustomerManagedPolicyReferences" in permissionSetJson
                else None,
                description=permissionSetJson["Description"],
                inline_policy=permissionSetJson["InlinePolicy"]
                if "InlinePolicy" in permissionSetJson
                else None,
                managed_policies=permissionSetJson["ManagedPolicies"]
                if "ManagedPolicies" in permissionSetJson
                else None,
                permissions_boundary=permissionSetJson["PermissionsBoundary"]
                if "PermissionsBoundary" in permissionSetJson
                else None,
                relay_state_type=permissionSetJson["RelayStateType"]
                if "RelayStateType" in permissionSetJson
                else None,
                session_duration=permissionSetJson["SessionDuration"]
                if "SessionDuration" in permissionSetJson
                else None,
                tags=permissionSetJson["Tags"] if "Tags" in permissionSetJson else None,
            )

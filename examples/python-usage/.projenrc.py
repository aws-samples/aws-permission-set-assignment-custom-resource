from projen.awscdk import AwsCdkPythonApp
from projen.python import PoetryPyprojectOptions

project = AwsCdkPythonApp(
    author_email="awsgalen@amazon.com",
    author_name="Galen Dunkleberger",
    cdk_version="2.65.0",
    module_name="python_usage",
    name="python-usage",
    version="0.1.0",
    poetry=True,
    deps=["boto3@*"],
    poetry_options=PoetryPyprojectOptions(),
    context={
        "@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId": False,
        "@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021": False,
        "@aws-cdk/aws-rds:lowercaseDbIdentifier": False,
        "@aws-cdk/core:stackRelativeExports": False,
    },
)
poetry_toml = project.try_find_file("poetry.toml")
poetry_toml.add_override("virtualenvs.create", "true")
poetry_toml.add_override("virtualenvs.in-project", "true")

project.synth()

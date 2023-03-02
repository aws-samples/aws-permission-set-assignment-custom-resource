# python-usage

## Overview
This project is an example of using the PermissionSetAssignment custom resource in a python cdk project.

## Prerequisites

1. Install [NodeJS](https://nodejs.org/en/download/)
1. Python 3.10 or later
1. Install [Poetry](https://python-poetry.org/docs/)

## Deployment



* Install python dependencies

  ```poetry install```

* Build the project
  
  ```npx projen build```

* Deploy to AWS

  ```npx projen deploy --all```

  (You'll need AWS credentials on the terminal for this to run correctly)
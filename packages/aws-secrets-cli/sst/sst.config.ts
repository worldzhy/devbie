// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- SST generates this reference to its platform config types
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aws-secrets-manager-rotation",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // `deploy-rotation` deploys with the AWS account id as the SST stage, so the
    // IAM ARNs can be scoped to that account. A manual `sst deploy --stage
    // production` falls back to a wildcard account segment.
    const accountId = /^\d{12}$/.test($app.stage) ? $app.stage : "*";

    // Create the Secrets Manager polling Lambda function
    const rotationFunction = new sst.aws.Function("SecretsManagerRotation", {
      handler: "function/index.handler",
      runtime: "nodejs20.x",
      timeout: "30 seconds",
      memory: "512 MB",
      environment: {
        NODE_ENV: "production",
      },
      permissions: [
        {
          actions: [
            "secretsmanager:DescribeSecret",
            "secretsmanager:GetSecretValue",
            "secretsmanager:PutSecretValue",
            "secretsmanager:UpdateSecretVersionStage",
          ],
          resources: [`arn:aws:secretsmanager:*:${accountId}:secret:*`],
        },
        {
          // GetRandomPassword does not operate on a specific secret, so IAM
          // requires the wildcard resource for this action.
          actions: ["secretsmanager:GetRandomPassword"],
          resources: ["*"],
        },
        {
          // AwsApiKeyStrategy derives the IAM username from the current key's
          // STS identity and rotates only that user's access keys, so the grant
          // is limited to IAM users instead of every IAM resource.
          actions: ["iam:CreateAccessKey", "iam:UpdateAccessKey", "iam:DeleteAccessKey"],
          resources: [`arn:aws:iam::${accountId}:user/*`],
        },
      ],
    });

    // Add a resource policy to the Lambda allowing Secrets Manager to invoke it
    new aws.lambda.Permission("SecretsManagerInvokePermission", {
      action: "lambda:InvokeFunction",
      function: rotationFunction.name,
      principal: "secretsmanager.amazonaws.com",
      statementId: "SecretsManagerAccess",
    });

    return {
      lambdaArn: rotationFunction.arn,
      lambdaName: rotationFunction.name,
    };
  },
});

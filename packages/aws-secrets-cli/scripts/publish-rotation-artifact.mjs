#!/usr/bin/env node
/**
 * Publishes the rotation Lambda artifact and its CloudFormation template to the
 * public artifact bucket (ADR-046). One build serves every customer: the web UI
 * links to a fixed template URL, so the consumer's env never has to track
 * releases. The bundle comes from the standalone `sst/` subpackage, which shares
 * no code with this CLI, so it changes only when the Lambda itself does.
 *
 * Usage:
 *   ROTATION_ARTIFACT_BUCKET=<bucket> npm run release:rotation -w @devbie/aws-secrets-cli
 *
 * Optional environment:
 *   ROTATION_ARTIFACT_PREFIX  key prefix (default: aws-secrets-cli/rotation)
 *   AWS_REGION                upload region (default: us-east-1)
 *
 * Steps: bundle the handler with esbuild -> zip -> upload the zip -> generate a
 * template with the bucket/key baked in -> upload the template -> HEAD-verify
 * both objects. Both objects keep fixed keys and are overwritten only when the
 * bundle changes; re-run this script (no version bump) to replace them.
 *
 * The template mirrors the SST definition in `sst/sst.config.ts` (handler,
 * runtime, timeout, memory, environment and IAM grants). Changing one side
 * without the other is a contract drift.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sstDir = path.join(packageDir, "sst");
const workDir = path.join(packageDir, "dist-rotation");
// The Lambda is an independent subpackage under `sst/` with its own version and
// dependencies, and shares no code with this CLI. Deriving anything from the CLI
// version minted a "new" artifact for every CLI-only release whose bundle was
// byte-identical, so only the Lambda's own version is stamped into the template.
const lambdaPackageJson = JSON.parse(fs.readFileSync(path.join(sstDir, "package.json"), "utf8"));
const version = lambdaPackageJson.version;

const bucket = process.env.ROTATION_ARTIFACT_BUCKET;
if (!bucket) {
  console.error("ROTATION_ARTIFACT_BUCKET is required (public-read artifact bucket).");
  process.exit(1);
}
const prefix = (process.env.ROTATION_ARTIFACT_PREFIX || "aws-secrets-cli/rotation").replace(/^\/+|\/+$/g, "");
const region = process.env.AWS_REGION || "us-east-1";
const artifactBase = "aws-secrets-rotation-lambda";
const artifactKey = `${prefix}/${artifactBase}.zip`;
const templateKey = `${prefix}/${artifactBase}.yaml`;

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options });
}

async function bundle() {
  // The Lambda dependencies live in sst/package.json (the SST deploy path
  // installs them too), so the bundle needs that node_modules tree.
  if (!fs.existsSync(path.join(sstDir, "node_modules"))) {
    console.info("Installing the rotation Lambda dependencies (sst/)...");
    run("npm", ["install", "--omit=dev"], { cwd: sstDir, stdio: "inherit" });
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  // Bundle the TypeScript handler into a single CommonJS file, matching what
  // SST produces on deploy. pg-native is an optional runtime binding that is
  // never installed on Lambda.
  await build({
    entryPoints: [path.join(sstDir, "function", "index.ts")],
    outfile: path.join(workDir, "index.js"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    external: ["pg-native"],
    logLevel: "warning",
  });

  const zipPath = path.join(workDir, `${artifactBase}.zip`);
  run("zip", ["-q", "-r", zipPath, "index.js"], { cwd: workDir });
  return zipPath;
}

function upload(filePath, key, contentType) {
  const response = run(
    "aws",
    [
      "s3api",
      "put-object",
      "--region",
      region,
      "--bucket",
      bucket,
      "--key",
      key,
      "--body",
      filePath,
      "--content-type",
      contentType,
      "--output",
      "json",
    ],
    { cwd: packageDir },
  );
  // A versioned bucket gives the template a fixed object version, which is the
  // integrity check ADR-046 asks for. Non-versioned buckets return no VersionId.
  try {
    return JSON.parse(response).VersionId || "";
  } catch {
    return "";
  }
}

function verify(key) {
  run("aws", ["s3api", "head-object", "--region", region, "--bucket", bucket, "--key", key, "--output", "json"], {
    cwd: packageDir,
  });
}

// The template only uses properties that CloudFormation's resource schema
// accepts. In particular AWS::Lambda::Permission has no StatementId property —
// the service generates the statement id — so adding one back breaks stack
// creation with "Unsupported property [StatementId]".
function cloudFormationTemplate(objectVersion) {
  const codeLines = [
    `          S3Bucket: ${bucket}`,
    `          S3Key: ${artifactKey}`,
    ...(objectVersion ? [`          S3ObjectVersion: ${objectVersion}`] : []),
  ].join("\n");

  return `AWSTemplateFormatVersion: "2010-09-09"
Description: Devbie Secrets Manager rotation Lambda ${version}. Deployed by the platform release pipeline; do not edit by hand.

Parameters:
  Environment:
    Type: String
    Default: production
    AllowedValues:
      - production
      - staging

Resources:
  RotationFunctionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: SecretRotation
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - secretsmanager:DescribeSecret
                  - secretsmanager:GetSecretValue
                  - secretsmanager:PutSecretValue
                  - secretsmanager:UpdateSecretVersionStage
                Resource: !Sub "arn:aws:secretsmanager:*:\${AWS::AccountId}:secret:*"
              - Effect: Allow
                Action: secretsmanager:GetRandomPassword
                Resource: "*"
              - Effect: Allow
                Action:
                  - iam:CreateAccessKey
                  - iam:UpdateAccessKey
                  - iam:DeleteAccessKey
                Resource: !Sub "arn:aws:iam::\${AWS::AccountId}:user/*"

  RotationFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: devbie-secrets-rotation
      Runtime: nodejs20.x
      Handler: index.handler
      Code:
${codeLines}
      Timeout: 30
      MemorySize: 512
      Role: !GetAtt RotationFunctionRole.Arn
      Environment:
        Variables:
          NODE_ENV: !Ref Environment
      Tags:
        - Key: devbie:component
          Value: secrets-rotation
        - Key: devbie:version
          Value: ${version}

  RotationFunctionPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunction
      FunctionName: !Ref RotationFunction
      Principal: secretsmanager.amazonaws.com

Outputs:
  RotationLambdaArn:
    Description: ARN to save as the rotation Lambda of the AWS account
    Value: !GetAtt RotationFunction.Arn
`;
}

async function main() {
  if (process.argv.includes("--print-template")) {
    // Release debugging: print the generated template without touching AWS.
    console.log(cloudFormationTemplate(""));
    return;
  }

  console.info(`Building the rotation Lambda artifact for version ${version}...`);
  const zipPath = await bundle();

  console.info(`Uploading s3://${bucket}/${artifactKey}...`);
  const objectVersion = upload(zipPath, artifactKey, "application/zip");

  const templatePath = path.join(workDir, `${artifactBase}.yaml`);
  fs.writeFileSync(templatePath, cloudFormationTemplate(objectVersion), "utf8");
  console.info(`Uploading s3://${bucket}/${templateKey}...`);
  upload(templatePath, templateKey, "application/yaml");

  verify(artifactKey);
  verify(templateKey);

  const templateUrl = `https://${bucket}.s3.${region}.amazonaws.com/${templateKey}`;
  console.info(`\nRotation Lambda artifact published (version ${version}).`);
  console.info(`Template URL: ${templateUrl}`);
  console.info(
    "Set this URL as NEXT_PUBLIC_AWS_SECRETS_ROTATION_LAMBDA_CLOUDFORMATION_TEMPLATE_URL in the consumer's build env.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

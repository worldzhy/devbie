import { DescribeSecretCommand, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { RotationEvent, smClient, RotationStrategy, SECRET_TYPE_TAG_KEY } from "./common.js";
import { AwsApiKeyStrategy } from "./strategies/aws-api-key.js";
import { RdsMysqlStrategy } from "./strategies/mysql.js";
import { RdsPostgresStrategy } from "./strategies/postgres.js";
import { DocumentDbStrategy } from "./strategies/documentdb.js";
import { GenericStrategy } from "./strategies/generic.js";

export async function handler(event: RotationEvent): Promise<void> {
  console.log("Rotation event received:", JSON.stringify(event, null, 2));
  const { Step, SecretId, ClientRequestToken } = event;

  try {
    const strategy = await getStrategy(SecretId);

    // Strategies receive the AWSCURRENT payload for context; setSecret/testSecret
    // also receive the AWSPENDING payload created in the createSecret step.

    // Fetch current secret for context
    const currentSecret = await smClient.send(
      new GetSecretValueCommand({ SecretId: SecretId, VersionStage: "AWSCURRENT" }),
    );
    const currentDict = JSON.parse(currentSecret.SecretString || "{}");

    // For set/test, we also need pendingDict
    let pendingDict: any = {};
    if (Step === "setSecret" || Step === "testSecret") {
      const pendingSecret = await smClient.send(
        new GetSecretValueCommand({ SecretId: SecretId, VersionId: ClientRequestToken, VersionStage: "AWSPENDING" }),
      );
      pendingDict = JSON.parse(pendingSecret.SecretString || "{}");
    }

    switch (Step) {
      case "createSecret":
        // Check if AWSPENDING already exists
        try {
          await smClient.send(
            new GetSecretValueCommand({
              SecretId: SecretId,
              VersionId: ClientRequestToken,
              VersionStage: "AWSPENDING",
            }),
          );
          console.log("AWSPENDING already exists.");
          return;
        } catch (e: any) {
          if (e.name !== "ResourceNotFoundException") throw e;
        }
        await strategy.createSecret(SecretId, ClientRequestToken, currentDict);
        break;
      case "setSecret":
        await strategy.setSecret(SecretId, ClientRequestToken, pendingDict, currentDict);
        break;
      case "testSecret":
        await strategy.testSecret(SecretId, ClientRequestToken, pendingDict);
        break;
      case "finishSecret":
        await strategy.finishSecret(SecretId, ClientRequestToken, currentSecret);
        break;
      default:
        throw new Error(`Unknown step: ${Step}`);
    }
  } catch (error) {
    console.error(`Error in step ${Step}:`, error);
    throw error;
  }
}

async function getStrategy(secretId: string): Promise<RotationStrategy> {
  // Strategy routing reads the `devbie:secret-type` tag (the tag contract
  // managed by the aws-secrets-manager module and the newbie CLI); only the
  // RDS engine hint still comes from the value payload.
  const description = await smClient.send(new DescribeSecretCommand({ SecretId: secretId }));
  const type = description.Tags?.find((tag) => tag.Key === SECRET_TYPE_TAG_KEY)?.Value;

  if (type === "AWS_API_KEY") {
    return new AwsApiKeyStrategy();
  } else if (type === "RDS_CREDENTIALS") {
    const currentSecret = await smClient.send(
      new GetSecretValueCommand({ SecretId: secretId, VersionStage: "AWSCURRENT" }),
    );
    const dict = JSON.parse(currentSecret.SecretString || "{}");
    if (dict.engine === "postgres") return new RdsPostgresStrategy();
    return new RdsMysqlStrategy(); // default or mysql
  } else if (type === "DOCUMENTDB_CREDENTIALS") {
    return new DocumentDbStrategy();
  } else {
    return new GenericStrategy();
  }
}

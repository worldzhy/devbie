import { PutSecretValueCommand, UpdateSecretVersionStageCommand } from "@aws-sdk/client-secrets-manager";
import { CreateAccessKeyCommand, DeleteAccessKeyCommand, UpdateAccessKeyCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { RotationStrategy, smClient, iamClient } from "../common.js";

export class AwsApiKeyStrategy implements RotationStrategy {
  async createSecret(secretId: string, token: string, currentDict: any): Promise<void> {
    const sts = new STSClient({
      credentials: {
        accessKeyId: currentDict.accessKeyId,
        secretAccessKey: currentDict.secretAccessKey,
      },
    });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    const username = identity.Arn?.split("/").pop();

    if (!username) throw new Error("Could not determine IAM username from current credentials");

    // Create new Key
    const createKeyRes = await iamClient.send(new CreateAccessKeyCommand({ UserName: username }));
    const newAccessKeyId = createKeyRes.AccessKey?.AccessKeyId;
    const newDict = {
      ...currentDict,
      accessKeyId: newAccessKeyId,
      secretAccessKey: createKeyRes.AccessKey?.SecretAccessKey,
      username: username,
    };

    try {
      await smClient.send(
        new PutSecretValueCommand({
          SecretId: secretId,
          ClientRequestToken: token,
          SecretString: JSON.stringify(newDict),
          VersionStages: ["AWSPENDING"],
        }),
      );
    } catch (err) {
      // Compensation: if the secret cannot be staged, the freshly created AK
      // must not be left active — delete it so a retry starts clean.
      if (newAccessKeyId) {
        try {
          await iamClient.send(new DeleteAccessKeyCommand({ UserName: username, AccessKeyId: newAccessKeyId }));
        } catch (cleanupErr) {
          console.error(
            `Failed to delete orphaned Access Key ${newAccessKeyId} after PutSecretValue failure:`,
            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          );
        }
      }
      throw err;
    }
  }

  async setSecret(_secretId: string, _token: string, _pendingDict: any, _currentDict: any): Promise<void> {
    // AWS API Key: Nothing to set on "service" side, already created in createSecret.
    return;
  }

  async testSecret(secretId: string, token: string, pendingDict: any): Promise<void> {
    const sts = new STSClient({
      credentials: {
        accessKeyId: pendingDict.accessKeyId,
        secretAccessKey: pendingDict.secretAccessKey,
      },
    });
    await sts.send(new GetCallerIdentityCommand({}));
  }

  async finishSecret(secretId: string, token: string, currentSecret: any): Promise<void> {
    // Standard finish
    await smClient.send(
      new UpdateSecretVersionStageCommand({
        SecretId: secretId,
        VersionStage: "AWSCURRENT",
        MoveToVersionId: token,
        RemoveFromVersionId: currentSecret.VersionId,
      }),
    );

    // Clean up old AWS API Key
    const currentDict = JSON.parse(currentSecret.SecretString || "{}");
    if (currentDict.accessKeyId && currentDict.username) {
      try {
        // Deactivate first
        await iamClient.send(
          new UpdateAccessKeyCommand({
            UserName: currentDict.username,
            AccessKeyId: currentDict.accessKeyId,
            Status: "Inactive",
          }),
        );
        // Then Delete
        await iamClient.send(
          new DeleteAccessKeyCommand({
            UserName: currentDict.username,
            AccessKeyId: currentDict.accessKeyId,
          }),
        );
        console.log(`Deleted old Access Key: ${currentDict.accessKeyId}`);
      } catch (e: any) {
        // A failed cleanup leaves the old Access Key active. This is a
        // security-relevant condition, not a warning — surface it as an error
        // so the rotation failure is visible in logs and alerts.
        console.error(`Failed to cleanup old API Key ${currentDict.accessKeyId}:`, e.message);
      }
    }
  }
}

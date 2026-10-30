import {
  PutSecretValueCommand,
  GetRandomPasswordCommand,
  UpdateSecretVersionStageCommand,
} from "@aws-sdk/client-secrets-manager";
import { MongoClient } from "mongodb";
import { RotationStrategy, smClient } from "../common.js";

export class DocumentDbStrategy implements RotationStrategy {
  async createSecret(secretId: string, token: string, currentDict: any): Promise<void> {
    const passwordRes = await smClient.send(
      new GetRandomPasswordCommand({
        PasswordLength: 32,
        ExcludeCharacters: "/@\"'\\",
        ExcludePunctuation: true,
      }),
    );
    const newDict = { ...currentDict, password: passwordRes.RandomPassword };

    await smClient.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        ClientRequestToken: token,
        SecretString: JSON.stringify(newDict),
        VersionStages: ["AWSPENDING"],
      }),
    );
  }

  async setSecret(secretId: string, token: string, pendingDict: any, currentDict: any): Promise<void> {
    const url = `mongodb://${currentDict.username}:${currentDict.password}@${currentDict.host}:${currentDict.port}/${currentDict.dbname || "test"}?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
    const client = new MongoClient(url, {
      tls: true,
      ...tlsCaOptions(),
    });
    await client.connect();
    const db = client.db(currentDict.dbname || "test");
    await db.command({
      updateUser: currentDict.username,
      pwd: pendingDict.password,
    });
    await client.close();
  }

  async testSecret(secretId: string, token: string, pendingDict: any): Promise<void> {
    const url = `mongodb://${pendingDict.username}:${pendingDict.password}@${pendingDict.host}:${pendingDict.port}/${pendingDict.dbname || "test"}?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
    const client = new MongoClient(url, tlsCaOptions());
    await client.connect();
    await client.db().command({ ping: 1 });
    await client.close();
  }

  async finishSecret(secretId: string, token: string, currentSecret: any): Promise<void> {
    await smClient.send(
      new UpdateSecretVersionStageCommand({
        SecretId: secretId,
        VersionStage: "AWSCURRENT",
        MoveToVersionId: token,
        RemoveFromVersionId: currentSecret.VersionId,
      }),
    );
  }
}

/**
 * TLS options for DocumentDB. Certificate verification stays enabled — a
 * rotation Lambda must never accept a forged certificate. The old hardcoded
 * `/opt/rds-combined-ca-bundle.pem` is neither shipped with the Lambda nor a
 * current bundle, so the runtime's system trust store (Amazon Trust Services
 * roots) is used by default; a bundled CA file can be supplied through
 * DOCUMENTDB_CA_FILE when the cluster still uses a legacy CA.
 */
function tlsCaOptions(): { tlsCAFile?: string } {
  return process.env.DOCUMENTDB_CA_FILE ? { tlsCAFile: process.env.DOCUMENTDB_CA_FILE } : {};
}

import { IAMClient } from "@aws-sdk/client-iam";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export const iamClient = new IAMClient({});
export const smClient = new SecretsManagerClient({});

/**
 * Tag carrying the SecretType of a managed secret. The canonical declaration
 * lives in the aws-secrets-manager NestJS module (`aws-secrets-manager.types.ts`,
 * `SECRET_TYPE_TAG_KEY`); this Lambda is deployed as a standalone SST project
 * and cannot import the host module, so the constant is mirrored here. Keep
 * the two in sync when changing the tag contract.
 */
export const SECRET_TYPE_TAG_KEY = "devbie:secret-type";

export interface RotationEvent {
  Step: "createSecret" | "setSecret" | "testSecret" | "finishSecret";
  SecretId: string;
  ClientRequestToken: string;
}

export interface RotationStrategy {
  createSecret(secretId: string, token: string, currentDict: any): Promise<void>;
  setSecret(secretId: string, token: string, pendingDict: any, currentDict: any): Promise<void>;
  testSecret(secretId: string, token: string, pendingDict: any): Promise<void>;
  finishSecret(secretId: string, token: string, currentSecret: any): Promise<void>;
}

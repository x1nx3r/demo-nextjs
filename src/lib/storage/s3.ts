import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function readS3Config(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "us-east-1";
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function isStorageConfigured(): boolean {
  return readS3Config() !== null;
}

let cachedClient: { key: string; client: S3Client } | null = null;

export function getS3Client(): S3Client {
  const config = readS3Config();
  if (!config) {
    throw new Error(
      "RustFS/S3 is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
    );
  }

  const key = JSON.stringify(config);
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = {
      key,
      client: new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        // Required for MinIO / RustFS style object stores.
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    };
  }

  return cachedClient.client;
}

export function getBucket(): string {
  const config = readS3Config();
  if (!config) {
    throw new Error("RustFS/S3 is not configured.");
  }
  return config.bucket;
}

export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!result.Body) {
    throw new Error(`Object has no body: ${key}`);
  }
  return result.Body.transformToByteArray();
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function listKeys(prefix: string): Promise<string[]> {
  const client = getS3Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: getBucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of result.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }

    continuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

export async function checkStorage(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: getBucket() }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

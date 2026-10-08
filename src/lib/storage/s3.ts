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
  const endpoint = process.env.RUSTFS_ENDPOINT ?? process.env.S3_ENDPOINT;
  const region =
    process.env.RUSTFS_REGION ?? process.env.S3_REGION ?? "us-east-1";
  const bucket = process.env.RUSTFS_BUCKET ?? process.env.S3_BUCKET;
  const accessKeyId =
    process.env.RUSTFS_ACCESS_KEY ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.RUSTFS_SECRET_KEY ?? process.env.S3_SECRET_ACCESS_KEY;

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
      "RustFS/S3 is not configured. Set RUSTFS_ENDPOINT, RUSTFS_BUCKET, RUSTFS_ACCESS_KEY and RUSTFS_SECRET_KEY.",
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

/**
 * The store sits behind a CDN, which returns transient 403/5xx under bursts of
 * reads. Retry those a few times so a blip does not look like a missing object
 * or a permission error.
 */
const RETRYABLE_STATUS = new Set([403, 408, 429, 500, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (e.$metadata?.httpStatusCode && RETRYABLE_STATUS.has(e.$metadata.httpStatusCode)) return true;
  return e.name === "TimeoutError" || e.name === "NetworkError" || e.name === "ThrottlingException";
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isRetryable(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
    }
  }
  throw last;
}

export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<void> {
  await withRetry(() =>
    getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    ),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const result = await withRetry(() =>
    getS3Client().send(new GetObjectCommand({ Bucket: getBucket(), Key: key })),
  );
  if (!result.Body) {
    throw new Error(`Object has no body: ${key}`);
  }
  return result.Body.transformToByteArray();
}

export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e.name === "NoSuchKey" ||
    e.name === "NotFound" ||
    e.Code === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await withRetry(() =>
      getS3Client().send(
        new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
      ),
    );
    return true;
  } catch (error) {
    // Only a genuine 404 means "absent". Anything else is a real failure and
    // must surface, so a transient read error cannot look like a cache miss.
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function listKeys(prefix: string): Promise<string[]> {
  const client = getS3Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await withRetry(() =>
      client.send(
        new ListObjectsV2Command({
          Bucket: getBucket(),
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      ),
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
  await withRetry(() =>
    getS3Client().send(
      new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
    ),
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

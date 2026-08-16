import { env } from "cloudflare:workers";
import { ApiError } from "./api-error.ts";

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_BINARY_BYTES = 12 * 1024 * 1024;
const OBJECT_KEY = /^[a-z0-9][a-z0-9_./-]{1,500}$/;

export type StoredObject = {
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
};

export class ArtifactRepository {
  constructor(private readonly bucket: R2Bucket) {}

  async putJson(objectKey: string, value: unknown): Promise<StoredObject> {
    const body = JSON.stringify(value);
    return this.putText(objectKey, body, "application/json", MAX_JSON_BYTES);
  }

  async putSource(objectKey: string, value: string): Promise<StoredObject> {
    return this.putText(objectKey, value, "text/plain; charset=utf-8", MAX_TEXT_BYTES);
  }

  async putArchive(objectKey: string, value: Uint8Array): Promise<StoredObject> {
    assertObjectKey(objectKey);
    if (value.byteLength > MAX_BINARY_BYTES) {
      throw new ApiError(413, "artifact_too_large", "Archive exceeds its policy limit");
    }
    const bytes = Uint8Array.from(value);
    const sha256 = await digestHex(bytes);
    const contentType = "application/zip";
    await this.bucket.put(objectKey, bytes, {
      httpMetadata: { contentType, cacheControl: "private, no-store" },
      customMetadata: { sha256, kilnVersion: "1" },
    });
    return { objectKey, sha256, sizeBytes: bytes.byteLength, contentType };
  }

  async getJson<T>(objectKey: string): Promise<T> {
    const text = await this.getText(objectKey, MAX_JSON_BYTES);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(
        500,
        "artifact_corrupt",
        "Stored build evidence is not valid JSON",
        false,
      );
    }
  }

  async getText(objectKey: string, maxBytes = MAX_TEXT_BYTES): Promise<string> {
    assertObjectKey(objectKey);
    const object = await this.bucket.get(objectKey);
    if (!object) {
      throw new ApiError(404, "artifact_not_found", "Build artifact was not found");
    }
    if (object.size > maxBytes) {
      throw new ApiError(
        500,
        "artifact_too_large",
        "Stored build artifact exceeds its policy limit",
        false,
      );
    }
    return object.text();
  }

  private async putText(
    objectKey: string,
    body: string,
    contentType: string,
    maxBytes: number,
  ): Promise<StoredObject> {
    assertObjectKey(objectKey);
    if (body.includes("\0")) {
      throw new ApiError(400, "invalid_artifact", "Artifact contains a null byte");
    }
    const bytes = new TextEncoder().encode(body);
    if (bytes.byteLength > maxBytes) {
      throw new ApiError(413, "artifact_too_large", "Artifact exceeds its policy limit");
    }
    const sha256 = await digestHex(bytes);
    await this.bucket.put(objectKey, bytes, {
      httpMetadata: { contentType, cacheControl: "private, no-store" },
      customMetadata: { sha256, kilnVersion: "1" },
    });
    return { objectKey, sha256, sizeBytes: bytes.byteLength, contentType };
  }
}

export function getArtifactRepository(): ArtifactRepository {
  if (!env.ARTIFACTS) {
    throw new ApiError(
      503,
      "artifact_storage_unavailable",
      "Build artifact storage is not configured",
    );
  }
  return new ArtifactRepository(env.ARTIFACTS);
}

export async function digestText(value: string): Promise<string> {
  return digestHex(new TextEncoder().encode(value));
}

function assertObjectKey(value: string): void {
  if (!OBJECT_KEY.test(value) || value.includes("..") || value.startsWith("/")) {
    throw new ApiError(400, "invalid_artifact_key", "Artifact key is not allowed");
  }
}

async function digestHex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

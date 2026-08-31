import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "us-east-1";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
export const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "docs-reservas-corporativas";

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Subir un archivo a Amazon S3
 */
export async function uploadFileToS3(
  keyNombre: string,
  bodyContent: Buffer,
  contentType: string = "application/octet-stream"
) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: keyNombre,
    Body: bodyContent,
    ContentType: contentType,
    StorageClass: "INTELLIGENT_TIERING",
  });

  const response = await s3Client.send(command);
  const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${keyNombre}`;

  return {
    success: true,
    key: keyNombre,
    url: publicUrl,
    response,
  };
}

/**
 * Generar URL prefirmada para ver o descargar el archivo de forma segura
 */
export async function getSignedDownloadUrl(
  keyNombre: string,
  originalName?: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: keyNombre,
    ResponseContentDisposition: originalName
      ? `inline; filename="${encodeURIComponent(originalName)}"`
      : undefined,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Eliminar un archivo de Amazon S3
 */
export async function deleteFileFromS3(keyNombre: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: keyNombre,
  });

  const response = await s3Client.send(command);
  return { success: true, response };
}

/**
 * Listar archivos dentro de un prefijo en S3
 */
export async function listFilesInS3(prefix: string = "") {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return response.Contents || [];
}

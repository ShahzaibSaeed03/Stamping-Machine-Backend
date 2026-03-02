import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/s3Client.js";

export const generateSignedUrl = async (
  keyOrUrl,
  disposition = "attachment",
  contentType = null
) => {

  let key = keyOrUrl;

  // If full URL is stored, extract key
  if (key.startsWith("https://")) {
    const url = new URL(key);
    key = decodeURIComponent(url.pathname.substring(1));
  }

  const command = new GetObjectCommand({
    Bucket: process.env.DO_SPACE_NAME,
    Key: key,
    ResponseContentDisposition: disposition,
    ...(contentType && { ResponseContentType: contentType })
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
};
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/s3Client.js";

const generateSignedUrl = async (keyOrUrl, disposition = "inline", contentType = "application/pdf") => {

  let key = keyOrUrl;

  if (key.startsWith("https://")) {
    const url = new URL(keyOrUrl);
    key = decodeURIComponent(url.pathname.slice(1));
  }

  const command = new GetObjectCommand({
    Bucket: process.env.DO_SPACE_NAME,
    Key: key,

    // ⭐ THIS decides view vs download
    ResponseContentDisposition: disposition,
    ResponseContentType: contentType
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
};

export { generateSignedUrl };
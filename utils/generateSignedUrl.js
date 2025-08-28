import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/s3Client.js";

// const generateSignedUrl = async (key) => {
//   const command = new GetObjectCommand({
//     Bucket: process.env.AWS_BUCKET_NAME,
//     Key: key,
//   });

//   const url = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 }); // 5 minutes
//   return url;
// };


const generateSignedUrl = async (keyOrUrl, customFilename = null) => {
  if (!keyOrUrl || typeof keyOrUrl !== "string") {
    throw new Error("Invalid key: must be a non-empty string");
  }

  // If it's a full URL, extract the key
  let key = keyOrUrl;
  if (key.startsWith("https://")) {
    const url = new URL(keyOrUrl);
    key = decodeURIComponent(url.pathname.slice(1)); // remove leading slash
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    ...(customFilename && { ResponseContentDisposition: `attachment; filename="${customFilename}"` }),
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });
};


export { generateSignedUrl };

// helpers/awsUtils.js
import { s3Client } from "../../config/s3Client.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

export const uploadToS3 = async (file, folder) => {
  const fileStream = fs.createReadStream(file.path);

  // Get the base name without any extension
  const baseName = path.basename(file.path).split(".")[0];

  // Determine the extension and prefix based on the folder
  let extension = "";
  let prefix = "";
  switch (folder) {
    case "certificates":
      extension = ".pdf";
      prefix = "Certificate-";
      break;
    case "ots":
      extension = ".pdf.ots";
      prefix = "Timestamp-";
      break;
    case "files":
      extension = path.extname(file.originalname);
      break;
  }

  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `${folder}/${prefix}${baseName}${extension}`,
    Body: fileStream,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadParams.Key}`;
  } catch (err) {
    console.error("Error uploading to S3:", err);
    throw new Error("Failed to upload file to S3");
  }
};

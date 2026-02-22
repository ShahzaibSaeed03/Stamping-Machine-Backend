import { s3Client } from "../../config/s3Client.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

export const uploadToS3 = async (file, folder) => {
  const fileStream = fs.createReadStream(file.path);

  const baseName = path.basename(file.path).split(".")[0];

  let extension = "";
  switch (folder) {
    case "certificates":
      extension = ".pdf";
      break;
    case "ots":
      extension = ".ots";
      break;
    case "files":
      extension = path.extname(file.originalname);
      break;
  }

  const key = `${folder}/${baseName}${extension}`.replace(/\\/g, "/");
  const uploadParams = {
    Bucket: process.env.DO_SPACE_NAME,
    Key: key,
    Body: fileStream,
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    return `https://${process.env.DO_SPACE_NAME}.${process.env.DO_REGION}.digitaloceanspaces.com/${key}`;
  } catch (err) {
    console.error("Error uploading to Spaces:", err);
    throw new Error("Failed to upload file");
  }
};
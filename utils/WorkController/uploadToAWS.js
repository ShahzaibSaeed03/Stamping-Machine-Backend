import { s3Client } from "../../config/s3Client.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import mime from "mime-types";

export const uploadToS3 = async (file, folder) => {

  const fileStream = fs.createReadStream(file.path);

  const originalBase = path.basename(
    file.originalname,
    path.extname(file.originalname)
  );

  const safeBase = originalBase.replace(/[^a-zA-Z0-9-_]/g, "_");

  let extension = "";
  let contentType = "application/octet-stream";
  let contentDisposition = "attachment";

  switch (folder) {

    // 🔹 CERTIFICATE (OPEN IN BROWSER)
    case "certificates":
      extension = ".pdf";
      contentType = "application/pdf";   // must be PDF
      contentDisposition = "inline";     // allow browser preview
      break;

    // 🔹 OTS (FORCE DOWNLOAD)
    case "ots":
      extension = ".ots";
      contentType = "application/octet-stream";
      contentDisposition = "attachment";
      break;

    // 🔹 ORIGINAL FILE (FORCE DOWNLOAD)
    case "files":
      extension = path.extname(file.originalname);
      contentType = mime.lookup(extension) || "application/octet-stream";
      contentDisposition = "attachment";
      break;

    default:
      extension = path.extname(file.originalname);
      contentType = mime.lookup(extension) || "application/octet-stream";
      contentDisposition = "attachment";
  }

  const key = `${folder}/${Date.now()}-${safeBase}${extension}`;

  const uploadParams = {
    Bucket: process.env.DO_SPACE_NAME,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
    ContentDisposition: contentDisposition
  };

  try {
    await s3Client.send(new PutObjectCommand(uploadParams));

    return `https://${process.env.DO_SPACE_NAME}.${process.env.DO_REGION}.digitaloceanspaces.com/${key}`;
  } catch (err) {
    console.error("Error uploading to Spaces:", err);
    throw new Error("Failed to upload file");
  }
};
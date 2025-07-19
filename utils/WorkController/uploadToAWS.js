import { uploadToS3 } from "./awsUtils.js";
import path from "path";

export const uploadToAWS = async ({ originalFile, certificateFile, otsFile, displayedID }) => {
  try {
    // Upload original file
    const fileUrl = await uploadToS3({
      path: originalFile,
      originalname: path.basename(originalFile) + path.extname(originalFile)
    }, 'files');

    // Upload certificate
    const certUrl = await uploadToS3({
      path: certificateFile,
      originalname: path.basename(certificateFile) + '.pdf'
    }, 'certificates');

    // Upload OTS file
    const otsUrl = await uploadToS3({
      path: otsFile,
      originalname: path.basename(otsFile) + '.ots'
    }, 'ots');

    return {
      fileUrl,
      certUrl,
      otsUrl
    };
  } catch (error) {
    console.error("Error in uploadToAWS:", error);
    throw new Error("Failed to upload files to AWS");
  }
};
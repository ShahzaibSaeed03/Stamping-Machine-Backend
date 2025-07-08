import { uploadFileToS3 } from "./awsUtils.js";
import {generateSignedUrl} from "../generateSignedUrl.js"

export const uploadToAWS = async ({
  originalFile,
  certificateFile,
  otsFile,
  displayedID,
}) => {
  const fileKey = `files/${displayedID}`;
  const certKey = `certificates/${displayedID}`;
  const otsKey = `ots/${displayedID}`;

  await uploadFileToS3(originalFile, fileKey);
  await uploadFileToS3(certificateFile, certKey);
  await uploadFileToS3(otsFile, otsKey);

  const fileUrl = await generateSignedUrl(fileKey);
  const certUrl = await generateSignedUrl(certKey);
  const otsUrl = await generateSignedUrl(otsKey);

  return {
    fileUrl,
    certUrl,
    otsUrl,
  };
};

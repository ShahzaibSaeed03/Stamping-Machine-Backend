import { uploadFileToS3 } from "./awsUtils.js";

export const uploadToAWS = async ({
  originalFile,
  certificateFile,
  otsFile,
  displayedID,
}) => {
  const fileKey = `files/${displayedID}`;
  const certKey = `certificates/${displayedID}`;
  const otsKey = `ots/${displayedID}`;

  const fileUrl = await uploadFileToS3(originalFile, fileKey);
  const certUrl = await uploadFileToS3(certificateFile, certKey);
  const otsUrl = await uploadFileToS3(otsFile, otsKey);

  return {
    fileUrl,
    certUrl,
    otsUrl,
  };
};

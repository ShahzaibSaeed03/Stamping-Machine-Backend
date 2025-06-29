import { uploadFileToS3 } from "./awsUtils.js";

export const uploadToAWS = async ({
  originalFile,
  certificateFile,
  otsFile,
  displayedID,
}) => {
  const fileUrl = await uploadFileToS3(originalFile, `files/${displayedID}`);
  const certUrl = await uploadFileToS3(
    certificateFile,
    `certificates/${displayedID}`
  );
  const otsUrl = await uploadFileToS3(otsFile, `ots/${displayedID}`);

  return {
    fileUrl,
    certUrl,
    otsUrl,
  };
};

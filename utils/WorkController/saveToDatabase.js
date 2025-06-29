import Work from "../../models/workModel.js";
import Certificate from "../../models/certificateModel.js";

export const saveToDatabase = async ({
  user,
  workTitle,
  additionalOwners,
  displayedID,
  fingerprint,
  s3Links,
  tsaData,
  originalFileName,
}) => {
  const certificate = await Certificate.create({
    certificate_name: displayedID,
    registration_date: new Date(),
    TSA: tsaData.blockInfo,
    id_file: s3Links.certUrl,
  });

  const work = await Work.create({
    user: user._id,
    work_title: workTitle,
    additional_owners: additionalOwners,
    sha256_fingerprint: fingerprint,
    displayed_id: displayedID,
    file_name: originalFileName,
    id_certificate: certificate._id,
    file_link: s3Links.fileUrl,
    certificate_link: s3Links.certUrl,
    ots_link: s3Links.otsUrl,
  });

  return work;
};

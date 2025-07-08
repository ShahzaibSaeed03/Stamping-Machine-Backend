import Work from "../../models/workModel.js";
import Certificate from "../../models/certificateModel.js";

export const saveToDatabase = async ({
  id_client,
  id_category,
  workCounter, // for number_for_client column
  displayed_ID:displayedID,
  status,
  title,
  copyright_owner,
  additional_copyright_owners,
  registeration_date,
  file_name, // original file name
  file_fingerprint,
  s3_links, // s3Links.fileUrl
  // id_certificate, // Certificate document Id
  // FROM HERE IS THE CERTIFICATE DATA
  // certificate_name: displayedID, // Use from above
  // registration_date: new Date(), // Use from above
  TSA,
}) => {
  try {
    // 1. Create certificate document
    const certificate = await Certificate.create({
      certificate_name: displayedID,
      registeration_date,
      TSA: TSA.blockInfo || null,
      id_file: s3_links.certUrl,
    });

    // 2. Format number
    const formattedNumber = workCounter.toString().padStart(4, "0");

    // 3. Create work document
    const work = await Work.create({
      id_client,
      id_category,
      number_for_client: formattedNumber,
      displayed_ID: displayedID,
      status,
      title,
      copyright_owner,
      additional_copyright_owners,
      registeration_date,
      displayed_id: displayedID,
      file_name,
      file_fingerprint,
      id_file: s3_links.fileUrl,
      id_certificate: certificate._id,
    });

    return work;

  } catch (error) {
    // Only handle unexpected errors here
    throw error;
  }
};
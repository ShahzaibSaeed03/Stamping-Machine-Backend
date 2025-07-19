import asyncHandler from "express-async-handler";
import Work from "../models/workModel.js";
import {
  computeSHA256,
  generateDisplayedID,
  generateCertificatePDF,
  extractFingerprintFromPDF,
} from "../utils/WorkController/helperFunctionsWorkController.js";
import { uploadToAWS } from "../utils/WorkController/uploadToAWS.js";
import { saveToDatabase } from "../utils/WorkController/saveToDatabase.js";
import { sendConfirmationEmail } from "../utils/WorkController/sendConfirmationEmail.js";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";
import { verifyOTS, stampWithOTS } from "../utils/WorkController/otsUtil.js";
import fs from 'fs';
import path from 'path';


// @desc    Get all works
// @route   GET /api/works
// @access  Private
const getAllWorks = asyncHandler(async (req, res) => {
  const works = await Work.find({})
    .populate('id_client', 'name email') // Populate user info
    .populate('id_certificate', 'certificate_name registration_date TSA') // Populate certificate info
    .sort({ registeration_date: -1 }); // Sort by registration date, newest first

  res.json({
    success: true,
    count: works.length,
    data: works.map(work => ({
      _id: work._id,
      title: work.title,
      copyright_owner: work.copyright_owner,
      additional_copyright_owners: work.additional_copyright_owners,
      displayed_ID: work.displayed_ID,
      registration_date: work.registeration_date,
      file_name: work.file_name,
      status: work.status,
      client: {
        _id: work.id_client._id,
        name: work.id_client.name,
        email: work.id_client.email
      },
      certificate: {
        _id: work.id_certificate._id,
        name: work.id_certificate.certificate_name,
        date: work.id_certificate.registration_date,
        TSA: work.id_certificate.TSA
      }
    }))
  });
});


// WORK CONTROLLER
// const uploadWork = asyncHandler(async (req, res) => {
//   const file = req.file;

//   if (!file) {
//     return res.status(400).json({
//       error: "No file uploaded. Please select a .zip file to upload.",
//     });
//   }

//   const user = req.user; // from auth middleware
//   const { workTitle, copyrightOwner, additionalOwners } = req.body;

//   if(!workTitle || !copyrightOwner || !additionalOwners) {
//     return res.status(400).json({
//       error: "Please fill in all fields.",
//     });
//   }

//   // Step 2: Compute SHA256 fingerprint
//   const fingerprint = await computeSHA256(file.path);

//   // Step 3: Calculate work counter and generate Displayed ID
//   const workCounter = await Work.countDocuments({ id_client: user._id });
//   const displayedID = await generateDisplayedID(user._id, workCounter); // user._id is serve as clientId

//   // Step 3.1: Check for duplicate displayed_ID before proceeding
//   const existingWork = await Work.findOne({ displayed_ID: displayedID });
//   if (existingWork) {
//     return res.status(409).json({
//       error: `A work with displayed ID "${displayedID}" already exists. Please try again.`,
//     });
//   }

//   // Step 4: Generate Certificate PDF
//   const certificatePath = await generateCertificatePDF({
//     workTitle,
//     copyrightOwner,
//     user,
//     additionalOwners,
//     displayedID,
//     fingerprint,
//     originalFileName: file.originalname,
//   });

//   // Step 5: Send to TSA
//   let tsaData;
//   try {
//     tsaData = await sendToTSA(certificatePath);
//   } catch (error) {
//     return res.status(500).json({ error: "Error executing ots" });
//   }

//   // Step 6: Upload all to AWS
//   const s3Links = await uploadToAWS({
//     originalFile: file.path,
//     certificateFile: certificatePath,
//     otsFile: certificatePath,
//     displayedID,
//   });

//   // Step 7: Save to MongoDB
//   const workCertificateData = await saveToDatabase({
//     id_client: user._id, // for id_client column
//     id_category: 1, // for id_category column
//     workCounter, // for number_for_client column
//     displayed_ID:displayedID,
//     status: true,
//     title:workTitle,
//     copyright_owner:copyrightOwner,
//     additional_copyright_owners:additionalOwners,
//     registeration_date: new Date(),
//     file_name: file.originalname,
//     file_fingerprint:fingerprint,
//     s3_links: s3Links, // s3Links.fileUrl, s3Links.certUrl
//     // id_certificate, // Certificate document Id
//     // FROM HERE IS THE CERTIFICATE DATA
//     // certificate_name: displayedID, // Use from above
//     // registration_date: new Date(), // Use from above
//     TSA: tsaData,
//     // id_file: s3Links.certUrl, // Get from above
//   });

//   // Step 8: Email confirmation to user
//   await sendConfirmationEmail(user.email, workTitle);

//   res.status(201).json({ message: "Work uploaded and registered", fingerprint: fingerprint, workCounter, displayedID, certificatePath, tsaData, s3Links, workCertificateData });

// });

const uploadWork = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded. Please select a .zip file to upload." });
  }

  const user = req.user;
  const { workTitle, copyrightOwner, additionalOwners } = req.body;
  if (!workTitle || !copyrightOwner || !additionalOwners) {
    return res.status(400).json({ error: "Please fill in all fields." });
  }

  const fingerprint = await computeSHA256(file.path);
  const workCounter = await Work.countDocuments({ id_client: user._id });
  const displayedID = await generateDisplayedID(user._id, workCounter);

  const existingWork = await Work.findOne({ displayed_ID: displayedID });
  if (existingWork) {
    return res.status(409).json({ error: `A work with displayed ID "${displayedID}" already exists. Please try again.` });
  }

  const certificatePath = await generateCertificatePDF({
    workTitle,
    copyrightOwner,
    user,
    additionalOwners,
    displayedID,
    fingerprint,
    originalFileName: file.originalname,
  });

  // 🔐 Step: Create OTS file using Python-based stamping
  let otsFilePath;
  try {
    otsFilePath = await stampWithOTS(certificatePath);
  } catch (error) {
    return res.status(500).json({ error: "Error generating .ots file using OpenTimestamps" });
  }

  // Upload files to AWS
  const s3Links = await uploadToAWS({
    originalFile: file.path,
    certificateFile: certificatePath,
    otsFile: otsFilePath,
    displayedID,
  });

  const workCertificateData = await saveToDatabase({
    id_client: user._id,
    id_category: 1,
    workCounter,
    displayed_ID: displayedID,
    status: true,
    title: workTitle,
    copyright_owner: copyrightOwner,
    additional_copyright_owners: additionalOwners,
    registeration_date: new Date(),
    file_name: file.originalname,
    file_fingerprint: fingerprint,
    s3_links: s3Links,
    TSA: {
      otsFilePath,
      blockInfo: "Pending (can be updated after verification)"
    }
  });


  // ✅ Generate Signed URLs
  const certificateUrl = await generateSignedUrl(s3Links.certUrl); 
  const originalFileUrl = await generateSignedUrl(s3Links.fileUrl);  
  const otsUrl = await generateSignedUrl(s3Links.otsUrl);

  await sendConfirmationEmail(user.email, workTitle);

  // res.status(201).json({
  //   message: "Work uploaded and registered",
  //   fingerprint,
  //   workCounter,
  //   displayedID,
  //   certificatePath,
  //   tsaData: {
  //     otsFilePath,
  //     blockInfo: "Pending (can be updated after verification)"
  //   },
  //   s3Links,
  //   workCertificateData
  // });

  res.status(201).json({
    status: 'success',
    message: "Work uploaded and registered successfully.",
    data: {
      displayed_id: displayedID,
      title: workTitle,
      registration_date: workCertificateData.registeration_date,
      fingerprint,
      certificate_url: certificateUrl,
      ots_url: otsUrl,
      original_file_url: originalFileUrl
    }
  });

});


// VERIFY WORK REGISTRATION CONTROLLER
// const verifyWorkRegistration = asyncHandler(async (req, res) => {
//   // Step 1: Check all files are present
//   const files = req.files;
//   if (!files || !files.file || !files.certificate || !files.ots) {
//     return res.status(400).json({
//       error: "Please select the file to be verified, its certificate and its .ots file."
//     });
//   }
//   const filePath = files.file[0].path;
//   const certificatePath = files.certificate[0].path;
//   const otsPath = files.ots[0].path;

//   // Step 3: Calculate fingerprint of the file
//   let fileFingerprint;
//   try {
//     fileFingerprint = await computeSHA256(filePath);
//   } catch (err) {
//     return res.status(400).json({ error: "Failed to calculate fingerprint of the file." });
//   }

//   // Step 5: Extract fingerprint from certificate
//   let certFingerprint;
//   try {
//     certFingerprint = await extractFingerprintFromPDF(certificatePath);
//   } catch (err) {
//     return res.status(400).json({ error: "File doesn't match the certificate. (Fingerprint not found in certificate)" });
//   }

//   if (fileFingerprint !== certFingerprint) {
//     // Not the end of verification, check registration
//     // Step 7: Check if certificate is registered
//     // Find by fingerprint or by displayed_ID (if extractable)
//     const work = await Work.findOne({ file_fingerprint: fileFingerprint });
//     if (!work) {
//       return res.status(404).json({
//         error: "This certificate is not in our database."
//       });
//     }
//     // Optionally, check TSA status (simulate for now)
//     // In a real implementation, you would verify the .ots file with OpenTimestamps
//     // For now, just return a simulated response
//     return res.status(200).json({
//       message: "File doesn't match the certificate, but the certificate is registered.",
//       registration: work.TSA || "Bitcoin block yyyyyy attests the existence of your file as of DDMMYYYY HHMMSS."
//     });
//   }

//   // If fingerprint matches, check registration
//   const work = await Work.findOne({ file_fingerprint: fileFingerprint });
//   if (!work) {
//     return res.status(404).json({
//       error: "This certificate is not in our database."
//     });
//   }
//   // Optionally, check TSA status (simulate for now)
//   // In a real implementation, you would verify the .ots file with OpenTimestamps
//   // For now, just return a simulated response
//   return res.status(200).json({
//     message: "Verification successful.",
//     registration: work.TSA || "Bitcoin block yyyyyy attests the existence of your file as of DDMMYYYY HHMMSS."
//   });
// });

const verifyWorkRegistration = asyncHandler(async (req, res) => {
  const files = req.files;
  if (!files || !files.originalFile || !files.certificate || !files.ots) {
    return res.status(400).json({
      error: "Please select the file to be verified, its certificate and its .ots file."
    });
  }

  // Get original paths
  const filePath = files.originalFile[0].path;
  const certificatePath = files.certificate[0].path;
  const otsPath = files.ots[0].path;

  // Get base names without any extensions
  const certBaseName = path.basename(certificatePath).split('.')[0];
  const otsBaseName = path.basename(otsPath).split('.')[0];

  // Create new paths with correct extensions
  const newCertPath = path.join(path.dirname(certificatePath), `${certBaseName}.pdf`);
  const newOtsPath = path.join(path.dirname(otsPath), `${otsBaseName}.pdf.ots`);

  // Rename files if they don't already have the correct extensions
  if (certificatePath !== newCertPath) {
    fs.renameSync(certificatePath, newCertPath);
  }
  if (otsPath !== newOtsPath) {
    fs.renameSync(otsPath, newOtsPath);
  }

  let fileFingerprint;
  try {
    fileFingerprint = await computeSHA256(filePath);
  } catch (err) {
    console.error("Error computing file fingerprint:", err);
    return res.status(400).json({ error: "Failed to calculate fingerprint of the file." });
  }

  let certFingerprint;
  try {
    certFingerprint = await extractFingerprintFromPDF(newCertPath);
  } catch (err) {
    console.error("Error extracting fingerprint from PDF:", err);
    return res.status(400).json({ error: "File doesn't match the certificate. (Fingerprint not found in certificate)" });
  }

  if (fileFingerprint !== certFingerprint) {
    const work = await Work.findOne({ file_fingerprint: fileFingerprint });
    if (!work) {
      return res.status(404).json({
        error: "This certificate is not in our database."
      });
    }

    const otsResult = await verifyOTS(newCertPath, newOtsPath);
    return res.status(200).json({
      message: "File doesn't match the certificate, but the certificate is registered.",
      otsStatus: otsResult
    });
  }

  const work = await Work.findOne({ file_fingerprint: fileFingerprint });
  if (!work) {
    return res.status(404).json({
      error: "This certificate is not in our database."
    });
  }

  const otsResult = await verifyOTS(newCertPath, newOtsPath);
  
  // Clean up temporary files after verification
  try {
    fs.unlinkSync(newCertPath);
    fs.unlinkSync(newOtsPath);
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error("Error cleaning up temporary files:", err);
  }

  return res.status(200).json({
    message: "Verification successful.",
    otsStatus: otsResult
  });
});


export { uploadWork, verifyWorkRegistration, getAllWorks };

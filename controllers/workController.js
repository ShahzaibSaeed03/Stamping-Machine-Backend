import asyncHandler from "express-async-handler";
import Work from "../models/workModel.js";
import {
  computeSHA256,
  generateDisplayedID,
  generateCertificatePDF,
  extractFingerprintFromPDF,
} from "../utils/WorkController/helperFunctionsWorkController.js";
import { uploadToAWS } from "../utils/WorkController/uploadToAWS.js";
import { uploadToS3 } from "../utils/WorkController/awsUtils.js";
import { saveToDatabase } from "../utils/WorkController/saveToDatabase.js";
import { sendConfirmationEmail } from "../utils/WorkController/sendConfirmationEmail.js";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";
import { verifyOTS, stampWithOTS } from "../utils/WorkController/otsUtil.js";
import fs from "fs";
import path from "path";

// @desc    Get all works
// @route   GET /api/works
// @access  Private
const getAllWorks = asyncHandler(async (req, res) => {
  const works = await Work.find({})
    .populate("id_client", "name email") // Populate user info
    .populate("id_certificate", "certificate_name registration_date TSA") // Populate certificate info
    .sort({ registeration_date: -1 }); // Sort by registration date, newest first

  res.json({
    success: true,
    count: works.length,
    data: works.map((work) => ({
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
        email: work.id_client.email,
      },
      certificate: {
        _id: work.id_certificate._id,
        name: work.id_certificate.certificate_name,
        date: work.id_certificate.registration_date,
        TSA: work.id_certificate.TSA,
      },
    })),
  });
});

// UPLOAD WORK REGISTRATION CONTROLLER
const uploadWork = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      error: "No file uploaded.",
    });
  }

  // Reject .js and .exe files explicitly
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".js" || ext === ".exe") {
    return res.status(400).json({ error: ".js and .exe files are not accepted" });
  }

  const user = req.user;
  const { workTitle, copyrightOwner, additionalOwners } = req.body;
  if (!workTitle || !copyrightOwner) {
    return res.status(400).json({ error: "Please fill in work title and copyright owner fields." });
  }

  const fingerprint = await computeSHA256(file.path);
  const workCounter = await Work.countDocuments({ id_client: user._id });
  const displayedID = await generateDisplayedID(user._id, workCounter);

  const existingWork = await Work.findOne({ displayed_ID: displayedID });
  if (existingWork) {
    return res.status(409).json({
      error: `A work with displayed ID "${displayedID}" already exists. Please try again.`,
    });
  }

  // First upload the original file to get its permanent URL for the certificate
  let originalFileUrl;
  try {
    originalFileUrl = await uploadToS3(
      { path: file.path, originalname: file.originalname },
      "files"
    );
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to upload original file to AWS" });
  }

  const certificatePath = await generateCertificatePDF({
    workTitle,
    copyrightOwner,
    user,
    additionalOwners: additionalOwners || "",
    displayedID,
    fingerprint,
    originalFileName: file.originalname,
    originalFileUrl,
  });

  // 🔐 Step: Create OTS file using Python-based stamping
  let otsFilePath;
  try {
    otsFilePath = await stampWithOTS(certificatePath);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Error generating .ots file using OpenTimestamps" });
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
    additional_copyright_owners: additionalOwners || "",
    registeration_date: new Date(),
    file_name: file.originalname,
    file_fingerprint: fingerprint,
    s3_links: s3Links,
    TSA: {
      otsFilePath,
      blockInfo: "Pending (can be updated after verification)",
    },
  });

  // ✅ Generate Signed URLs
  const certificateUrl = await generateSignedUrl(s3Links.certUrl);
  const signedOriginalFileUrl = await generateSignedUrl(s3Links.fileUrl);
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
    status: "success",
    message: "Work uploaded and registered successfully.",
    data: {
      displayed_id: displayedID,
      title: workTitle,
      registration_date: workCertificateData.registeration_date,
      fingerprint,
      certificate_url: certificateUrl,
      ots_url: otsUrl,
      original_file_url: signedOriginalFileUrl,
    },
  });
});

// Verify Work Controller
const verifyWorkRegistration = asyncHandler(async (req, res) => {
  const files = req.files;
  if (!files || !files.originalFile || !files.certificate || !files.ots) {
    return res.status(400).json({
      error:
        "Please select the file to be verified, its certificate and its .ots file.",
    });
  }

  // Reject .js and .exe uploads for any of the provided files
  const fieldsToCheck = ['originalFile', 'certificate', 'ots'];
  for (const field of fieldsToCheck) {
    const originalname = files[field][0].originalname || '';
    const ext = path.extname(originalname).toLowerCase();
    if (ext === '.js' || ext === '.exe') {
      return res.status(400).json({ error: '.js and .exe files are not accepted' });
    }
  }

  // Get original paths
  const filePath = files.originalFile[0].path;
  const certificatePath = files.certificate[0].path;
  const otsPath = files.ots[0].path;

  // Get base names without any extensions
  const certBaseName = path.basename(certificatePath).split(".")[0];
  const otsBaseName = path.basename(otsPath).split(".")[0];

  // Create new paths with correct extensions
  const newCertPath = path.join(
    path.dirname(certificatePath),
    `${certBaseName}.pdf`
  );
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
    return res
      .status(400)
      .json({ error: "Failed to calculate fingerprint of the file." });
  }

  let certFingerprint;
  try {
    certFingerprint = await extractFingerprintFromPDF(newCertPath);
    if (process.env.NODE_ENV === "development") {
      console.log(
        "Successfully extracted certificate fingerprint:",
        certFingerprint
      );
    }
  } catch (err) {
    console.error("Error extracting fingerprint from PDF:", err);
    return res.status(400).json({
      error:
        "File doesn't match the certificate. (Fingerprint not found in certificate)",
    });
  }

  if (fileFingerprint !== certFingerprint) {
    const work = await Work.findOne({ file_fingerprint: fileFingerprint });
    if (!work) {
      return res.status(404).json({
        error: "This certificate is not in our database.",
      });
    }

    const otsResult = await verifyOTS(newCertPath, newOtsPath);
    return res.status(200).json({
      message:
        "File doesn't match the certificate, but the certificate is registered.",
      otsStatus: otsResult,
    });
  }

  const work = await Work.findOne({ file_fingerprint: fileFingerprint });
  if (!work) {
    return res.status(404).json({
      error: "This certificate is not in our database.",
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
    otsStatus: otsResult,
  });
});

// @desc    Get works for a specific user
// @route   GET /api/works/user/:userId
// @access  Private
const getWorksByUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check if the user is requesting their own works or if they have admin privileges
  if (req.user._id.toString() !== userId && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "You can only view your own works",
    });
  }

  const works = await Work.find({ id_client: userId, status: true })
    .populate("id_client", "name email")
    .populate("id_certificate", "certificate_name registration_date TSA")
    .sort({ registeration_date: -1 });

  if (!works || works.length === 0) {
    return res.status(404).json({
      success: false,
      error: "No works found for this user",
    });
  }

  res.json({
    success: true,
    count: works.length,
    data: works.map((work) => ({
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
        email: work.id_client.email,
      },
      certificate: {
        _id: work.id_certificate._id,
        name: work.id_certificate.certificate_name,
        date: work.id_certificate.registration_date,
        TSA: work.id_certificate.TSA,
      },
    })),
  });
});

export { uploadWork, verifyWorkRegistration, getAllWorks, getWorksByUser };

import asyncHandler from "express-async-handler";
import Work from "../models/workModel.js";
import {
  computeSHA256,
  generateDisplayedID,
  generateCertificatePDF,
  extractFingerprintFromPDF,
  formatDateForCertificate
} from "../utils/WorkController/helperFunctionsWorkController.js";
import { uploadToS3 } from "../utils/WorkController/awsUtils.js";
import { saveToDatabase } from "../utils/WorkController/saveToDatabase.js";
import { sendConfirmationEmail } from "../utils/WorkController/sendConfirmationEmail.js";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";
import { verifyOTS, stampWithOTS, getBlockByHeight } from "../utils/WorkController/otsUtil.js";
import Counter from "../models/counterModel.js";
import fs from "fs";
import path from "path";

// GET ALL WORKS CONTROLLER
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
    return res.status(400).json({ error: "We don't accept .js and .exe files." });
  }

  const user = req.user;
  const { workTitle, copyrightOwner, additionalOwners } = req.body;
  if (!workTitle || !copyrightOwner) {
    return res.status(400).json({ error: "Please fill in work title and copyright owner fields." });
  }

  // Ensure user has a sequential userSeq; if not, assign one atomically
  if (!user.userSeq && user.userSeq !== 0) {
    const counter = await Counter.findOneAndUpdate(
      { _id: "userSeq" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    user.userSeq = counter.seq;
    await user.save();
  }

  const fingerprint = await computeSHA256(file.path);
  const workCounter = await Work.countDocuments({ id_client: user._id });
  const displayedID = await generateDisplayedID(user.userSeq, workCounter);

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
    otsFilePath = await stampWithOTS(certificatePath, displayedID);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Error generating .ots file using OpenTimestamps" });
  }

  // Upload files to AWS
// Upload certificate
const certFileUrl = await uploadToS3(
  { path: certificatePath, originalname: `Certificate-${displayedID}.pdf` },
  "certificates"
);

// Upload ots
const otsFileUrl = await uploadToS3(
  { path: otsFilePath, originalname: `Timestamp-${displayedID}.ots` },
  "ots"
);

const s3Links = {
  fileUrl: originalFileUrl,
  certUrl: certFileUrl,
  otsUrl: otsFileUrl,
};

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
    otsFileUrl: s3Links.otsUrl, // Pass OTS file URL
  });

  // ✅ Generate Signed URLs
  const certificateUrl = await generateSignedUrl(s3Links.certUrl);
  const signedOriginalFileUrl = await generateSignedUrl(s3Links.fileUrl);
  const otsUrl = await generateSignedUrl(s3Links.otsUrl);

  // await sendConfirmationEmail(user.email, workTitle);

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
      id: workCertificateData._id,
      displayed_id: displayedID,
      title: workTitle,
      registration_date: formatDateForCertificate(workCertificateData.registeration_date),
      fingerprint,
      certificate_url: certificateUrl,
      ots_url: otsUrl,
      original_file_url: signedOriginalFileUrl,
    },
  });
});

// VERIFY WORK CONTROLLER
const verifyWorkRegistration = asyncHandler(async (req, res) => {
  const files = req.files;

  if (!files || !files.originalFile || !files.certificate || !files.ots) {
    return res.status(400).json({
      error:
        "Please select the file to be verified, its certificate and its .ots file.",
    });
  }

  const fieldsToCheck = ["originalFile", "certificate", "ots"];
  for (const field of fieldsToCheck) {
    const originalname = files[field][0].originalname || "";
    const ext = path.extname(originalname).toLowerCase();
    if (ext === ".js" || ext === ".exe") {
      return res
        .status(400)
        .json({ error: ".js and .exe files are not accepted" });
    }
  }

  const filePath = files.originalFile[0].path;
  const certificatePath = files.certificate[0].path;
  const otsPath = files.ots[0].path;

  // 1️⃣ fingerprint original file
  let fileFingerprint;
  try {
    fileFingerprint = await computeSHA256(filePath);
  } catch (err) {
    return res
      .status(400)
      .json({ error: "Failed to calculate fingerprint of the file." });
  }

  // 2️⃣ fingerprint certificate
  let certFingerprint;
  try {
    certFingerprint = await extractFingerprintFromPDF(certificatePath);
  } catch (err) {
    return res.status(400).json({
      error:
        "File doesn't match the certificate. (Fingerprint not found in certificate)",
    });
  }

  // 3️⃣ compare fingerprints
  if (fileFingerprint !== certFingerprint) {
    return res.status(400).json({
      error:
        "File doesn't match the certificate. The uploaded file and certificate have different fingerprints.",
      details: { fileFingerprint, certFingerprint },
    });
  }

  // 4️⃣ find work
  const work = await Work.findOne({ file_fingerprint: fileFingerprint });
  if (!work) {
    return res
      .status(404)
      .json({ error: "This certificate is not in our database." });
  }

  // 5️⃣ verify OTS (NO rename)
  const otsResult = await verifyOTS(certificatePath, otsPath);

  // cleanup temp files
  try {
    fs.unlinkSync(filePath);
    fs.unlinkSync(certificatePath);
    fs.unlinkSync(otsPath);
  } catch (err) {}

  return res.status(200).json({
    message:
      otsResult.status === "verified"
        ? "Timestamp verified on Bitcoin network."
        : otsResult.status === "pending"
        ? "Timestamp submitted. Waiting for Bitcoin confirmation."
        : "Verification failed.",
    otsStatus: otsResult,
    registeration_date: formatDateForCertificate(work.registeration_date),
  });
});

// @desc    Get works for a specific user
// @route   GET /api/works/user/:userId
// @access  Private
const getWorksByUser = asyncHandler(async (req,res)=>{

const {userId}=req.params;

const works = await Work.find({ id_client:userId, status:true })
.populate("id_client","email")
.populate("id_certificate")   // IMPORTANT → we need id_file from certificate
.sort({ registeration_date:-1 });

const data = await Promise.all(
works.map(async(work)=>{

const downloadUrl = work.id_file
? await generateSignedUrl(work.id_file)
: null;

const certificateUrl = work.id_certificate?.id_file
? await generateSignedUrl(work.id_certificate.id_file)
: null;

const otsUrl = work.id_ots
? await generateSignedUrl(work.id_ots)
: null;

return {
_id:work._id,
title:work.title,
displayed_ID:work.displayed_ID,
registration_date:work.registeration_date,
file_name:work.file_name,
status:work.status,

downloadUrl,
certificateUrl,
otsUrl,

client:{
_id:work.id_client._id,
email:work.id_client.email
},

certificate:{
_id:work.id_certificate?._id,
name:work.id_certificate?.certificate_name,
date:work.id_certificate?.registration_date,
TSA:work.id_certificate?.TSA
}
};
})
);

res.json({
success:true,
count:data.length,
data
});

});
// DELETE WORK
const deleteWork = asyncHandler(async (req,res)=>{

const {id}=req.params;

const work=await Work.findById(id);

if(!work){
res.status(404);
throw new Error("Work not found");
}

/* owner check */
if(work.id_client.toString()!==req.user._id.toString()){
res.status(403);
throw new Error("Unauthorized");
}

/* delete */
await Work.findByIdAndDelete(id);

res.json({message:"Work deleted"});
});
export { uploadWork, verifyWorkRegistration, getAllWorks, getWorksByUser,deleteWork };

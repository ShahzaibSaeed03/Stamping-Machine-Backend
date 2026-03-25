import asyncHandler from "express-async-handler";
import Work from "../models/workModel.js";
import SharedWork from "../models/sharedWorkModel.js";
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
import { verifyOTS, stampWithOTS, } from "../utils/WorkController/otsUtil.js";
import { deductTokens } from "../services/token.service.js";
import Counter from "../models/counterModel.js";
import fs from "fs";
import crypto from "crypto";

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
  if (!file) return res.status(400).json({ error: "No file uploaded." });

  const user = req.user;

  /* 🚨 TOKEN CHECK */
  if (user.tokens < 1) {
    return res.status(400).json({
      error: "Not enough tokens. Please buy tokens before uploading."
    });
  }

  /* VALIDATE FILE */
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".js" || ext === ".exe") {
    return res.status(400).json({ error: "We don't accept .js and .exe files." });
  }

  const { workTitle, copyrightOwner, additionalOwners } = req.body;
  if (!workTitle || !copyrightOwner) {
    return res.status(400).json({
      error: "Please fill in work title and copyright owner fields."
    });
  }

  /* USER SEQ */
  if (!user.userSeq && user.userSeq !== 0) {
    const counter = await Counter.findOneAndUpdate(
      { _id: "userSeq" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    user.userSeq = counter.seq;
    await user.save();
  }

  /* HASH */
  const fingerprint = await computeSHA256(file.path);

  const workCounter = await Work.countDocuments({ id_client: user._id });
  const displayedID = await generateDisplayedID(user.userSeq, workCounter);

  /* UPLOAD ORIGINAL */
  const originalFileUrl = await uploadToS3(
    { path: file.path, originalname: file.originalname },
    "files"
  );

  /* CERTIFICATE */
  const certificatePath = await generateCertificatePDF({
    workTitle,
    copyrightOwner,
    user,
    additionalOwners: additionalOwners || "",
    displayedID,
    fingerprint,
    originalFileName: file.originalname,
    originalFileUrl
  });

  /* OTS */
  const otsFilePath = await stampWithOTS(certificatePath, displayedID);  /* UPLOAD CERT + OTS */
  const certFileUrl = await uploadToS3(
    { path: certificatePath, originalname: `Certificate-${displayedID}.pdf` },
    "certificates"
  );

  const otsFileUrl = await uploadToS3(
    { path: otsFilePath, originalname: `Timestamp-${displayedID}.ots` },
    "ots"
  );

  const s3Links = {
    fileUrl: originalFileUrl,
    certUrl: certFileUrl,
    otsUrl: otsFileUrl
  };

  /* SAVE DB */
  const workData = await saveToDatabase({
    id_client: user._id,
    id_category: 1,          // ⭐ REQUIRED
    workCounter,             // ⭐ REQUIRED
    displayed_ID: displayedID,
    status: true,            // ⭐ REQUIRED

    title: workTitle,
    copyright_owner: copyrightOwner,
    additional_copyright_owners: additionalOwners || "",
    registeration_date: new Date(),
    file_name: file.originalname,
    file_fingerprint: fingerprint,

    s3_links: s3Links,

    TSA: {
      otsFilePath,
      blockInfo: "Pending confirmation"
    },

    otsFileUrl
  });

  /* ✅ DEDUCT TOKEN AFTER SUCCESS */
  /* ✅ DEDUCT TOKEN AFTER SUCCESS */
  await deductTokens(user._id, 1, workData._id);

  /* ✅ SEND CONFIRMATION EMAIL */
  try {
    await sendConfirmationEmail(user.email, workTitle);
  } catch (err) {
    console.error("Email failed:", err.message);
  }
  /* SIGNED URL */
  const certificateUrl = await generateSignedUrl(s3Links.certUrl);
  const signedFileUrl = await generateSignedUrl(s3Links.fileUrl);
  const otsUrl = await generateSignedUrl(s3Links.otsUrl);

  res.status(201).json({
    status: "success",
    message: "Work uploaded and registered successfully.",
    data: {
      id: workData._id,
      displayed_id: displayedID,
      title: workTitle,
      registration_date: formatDateForCertificate(workData.registeration_date),
      fingerprint,
      certificate_url: certificateUrl,
      original_file_url: signedFileUrl,
      ots_url: otsUrl
    }
  });

});

// VERIFY WORK CONTROLLER
const verifyWorkRegistration = asyncHandler(async (req, res) => {

  const files = req.files;

  if (!files || !files.originalFile || !files.certificate || !files.ots) {
    return res.status(400).json({
      message: "Please upload original file, certificate and ots file"
    });
  }

  const filePath = files.originalFile[0].path;
  const certificatePath = files.certificate[0].path;
  const otsPath = files.ots[0].path;

  const fileFingerprint = await computeSHA256(filePath);
  const certFingerprint = await extractFingerprintFromPDF(certificatePath);

  if (fileFingerprint !== certFingerprint) {
    return res.status(400).json({
      message: "File doesn't match certificate"
    });
  }

  // ✅ NO DATABASE CHECK

  const otsResult = await verifyOTS(certificatePath, otsPath);

  return res.json({
    message: otsResult.message,
    otsStatus: otsResult
  });

});

// @desc    Get works for a specific user
// @route   GET /api/works/user/:userId
// @access  Private
const getWorksByUser = asyncHandler(async (req, res) => {

  const { userId } = req.params;

  const works = await Work.find({ id_client: userId, status: true })
    .populate("id_client", "email")
    .populate("id_certificate")
    .sort({ registeration_date: -1 });

  /* ⭐ FETCH ALL SHARES (FAST WAY) */
  const workIds = works.map(w => w._id);

  const shares = await SharedWork.find({
    id_work: { $in: workIds }
  });

  const shareMap = new Map(
    shares.map(s => [s.id_work.toString(), s])
  );

  const data = await Promise.all(
    works.map(async (work) => {

      let share = shareMap.get(work._id.toString());

      if (!share) {
        share = await SharedWork.create({
          id_work: work._id,
          sha256_string: crypto.randomBytes(32).toString("hex"),
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
      }
      const downloadUrl = work.id_file
        ? await generateSignedUrl(work.id_file)
        : null;

      const certificateViewUrl = work.id_certificate?.id_file
        ? await generateSignedUrl(work.id_certificate.id_file, "inline", "application/pdf")
        : null;

      const certificateUrl = work.id_certificate?.id_file
        ? await generateSignedUrl(work.id_certificate.id_file)
        : null;

      const otsUrl = work.id_ots
        ? await generateSignedUrl(work.id_ots)
        : null;

      return {
        _id: work._id,

        /* BASIC */
        title: work.title,
        displayed_ID: work.displayed_ID,
        registration_date: work.registeration_date,
        file_name: work.file_name,
        status: work.status,

        /* ✅ CERTIFICATE STYLE DETAILS */
        workTitle: work.title,
        copyrightOwner: work.copyright_owner,
        additionalOwners: work.additional_copyright_owners || "-",

        referenceNumber: work.displayed_ID,
        registrationDateFormatted: formatDateForCertificate(work.registeration_date),

        timestampAuthority: work.id_certificate?.TSA || "OpenTimestamps",

        fingerprint: work.file_fingerprint,

        /* FILE LINKS */
        downloadUrl,
        certificateUrl,
        certificateViewUrl,
        otsUrl,

        /* SHARE */
        shareId: share.sha256_string,
        shareUrl: `${process.env.FRONTEND_URL}shared/${share.sha256_string}`,
        passwordProtected: !!share?.password_hash,

        client: {
          _id: work.id_client._id,
          email: work.id_client.email
        },

        certificate: {
          _id: work.id_certificate?._id,
          name: work.id_certificate?.certificate_name,
          date: work.id_certificate?.registration_date,
          TSA: work.id_certificate?.TSA
        }
      };
    })
  );

  res.json({
    success: true,
    count: data.length,
    data
  });

});
// DELETE WORK
const deleteWork = asyncHandler(async (req, res) => {

  const { id } = req.params;

  const work = await Work.findById(id);

  if (!work) {
    res.status(404);
    throw new Error("Work not found");
  }

  /* owner check */
  if (work.id_client.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Unauthorized");
  }

  /* delete */
  await Work.findByIdAndDelete(id);

  res.json({ message: "Work deleted" });
});
export { uploadWork, verifyWorkRegistration, getAllWorks, getWorksByUser, deleteWork };    
import asyncHandler from "express-async-handler";
import SharedWork from "../models/sharedWorkModel.js";
import Work from "../models/workModel.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";
import { sendEmail } from "../utils/sendEmail.js";

/* ================= HELPER ================= */
async function ensureShareExists(workId) {
  let share = await SharedWork.findOne({ id_work: workId });

  if (!share) {
    share = await SharedWork.create({
      id_work: workId,
      sha256_string: crypto.randomBytes(32).toString("hex"),
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  }

  return share;
}

/* ================= SET PASSWORD ================= */
export const setSharePassword = asyncHandler(async (req, res) => {
  const { workId, password } = req.body;
  const user = req.user;

  if (!password || password.length < 6)
    throw new Error("Password min 6");

  const work = await Work.findById(workId);
  if (!work) throw new Error("Work not found");

  if (work.id_client.toString() !== user._id.toString())
    throw new Error("Unauthorized");

  const share = await ensureShareExists(workId);

  const hash = await bcrypt.hash(password, 10);

  share.password_hash = hash;
  share.end_date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await share.save();

  const shareUrl = `${process.env.FRONTEND_URL}shared/${share.sha256_string}`;

  /* EMAIL */
  try {
    await sendEmail({
      to: user.email,
      subject: `Your password for your work number: ${work.displayed_ID}`,
      html: `
      <div style="font-family:Arial;line-height:1.6">
        <h2>Work Access Details</h2>

        <p>Password for work <b>${work.displayed_ID}</b>:</p>
        <p><b>${password}</b></p>

        <p><b>Direct access (no password):</b></p>
        <a href="${shareUrl}">View Work</a>

        <hr/>

        <p><b>Access using reference:</b></p>
        <ol>
          <li>${process.env.FRONTEND_URL}view-register-work</li>
          <li>Reference: ${work.displayed_ID}</li>
          <li>Password:  ${password}</li>
        </ol>

        <p>Expires in 7 days</p>
      </div>
      `
    });
  } catch (err) {
    console.log("Email failed:", err.message);
  }

  res.json({
    message: "Password set",
    shareId: share.sha256_string,
    shareUrl,
    reference: work.displayed_ID
  });
});

/* ================= CREATE / GET SHARE LINK ================= */
export const createShareLink = asyncHandler(async (req, res) => {
  const { workId } = req.body;

  const share = await ensureShareExists(workId);

  res.json({
    shareId: share.sha256_string,
    shareUrl: `${process.env.FRONTEND_URL}shared/${share.sha256_string}`
  });
});

/* ================= ACCESS VIA LINK (NO PASSWORD) ================= */
export const getSharedWork = asyncHandler(async (req, res) => {
  const { shareId } = req.params;

  const sharedWork = await SharedWork.findOne({
    sha256_string: shareId
  }).populate({
    path: "id_work",
    populate: { path: "id_certificate" }
  });

  if (!sharedWork) throw new Error("Share not found");
  if (sharedWork.end_date < new Date())
    throw new Error("Link expired");

  const work = sharedWork.id_work;

  const fileUrl = work.id_file
    ? await generateSignedUrl(work.id_file)
    : null;

  const certUrl = work.id_certificate?.id_file
    ? await generateSignedUrl(work.id_certificate.id_file)
    : null;

  const otsUrl = work.id_ots
    ? await generateSignedUrl(work.id_ots)
    : null;

  res.json({
    status: "success",
    shareId,
    data: {
      _id: work._id,
      title: work.title,
      copyright_owner: work.copyright_owner,
      additional_copyright_owners: work.additional_copyright_owners,
      displayed_ID: work.displayed_ID,
      registration_date: work.registeration_date,
      file_name: work.file_name,
      file_fingerprint: work.file_fingerprint,
      downloadUrl: fileUrl,
      certificateUrl: certUrl,
      otsUrl
    }
  });
});

/* ================= ACCESS BY REFERENCE (PASSWORD) ================= */
export const accessByReference = asyncHandler(async (req, res) => {
  const { reference, password } = req.body;

  if (!reference || !password)
    throw new Error("Reference and password required");

  const work = await Work.findOne({ displayed_ID: reference });
  if (!work) throw new Error("Work not found");

  const share = await SharedWork.findOne({ id_work: work._id });
  if (!share) throw new Error("Share not available");

  const isMatch = await bcrypt.compare(password, share.password_hash);
  if (!isMatch) throw new Error("Invalid password");

  if (share.end_date < new Date())
    throw new Error("Link expired");

  const fileUrl = work.id_file
    ? await generateSignedUrl(work.id_file)
    : null;

  const certUrl = work.id_certificate?.id_file
    ? await generateSignedUrl(work.id_certificate.id_file)
    : null;

  const otsUrl = work.id_ots
    ? await generateSignedUrl(work.id_ots)
    : null;

  res.json({
    status: "success",
    data: {
      _id: work._id,
      title: work.title,
      displayed_ID: work.displayed_ID,
      downloadUrl: fileUrl,
      certificateUrl: certUrl,
      otsUrl
    }
  });
});

/* ================= LIST SHARES (AUTO CREATE) ================= */
export const listWorkShares = asyncHandler(async (req, res) => {
  const { workId } = req.params;
  const user = req.user;

  const work = await Work.findById(workId);
  if (!work || work.id_client.toString() !== user._id.toString())
    throw new Error("Unauthorized");

  const share = await ensureShareExists(workId);

  res.json({
    shares: [
      {
        id: share._id,
        shareId: share.sha256_string,
        shareUrl: `${process.env.FRONTEND_URL}shared/${share.sha256_string}`,
        expiryDate: share.end_date,
        passwordProtected: !!share.password_hash
      }
    ]
  });
});

/* ================= DELETE SHARE ================= */
export const deleteShare = asyncHandler(async (req, res) => {
  const { shareId } = req.params;
  const user = req.user;

  const share = await SharedWork.findById(shareId).populate("id_work");

  if (!share) throw new Error("Share not found");

  if (share.id_work.id_client.toString() !== user._id.toString())
    throw new Error("Unauthorized");

  await SharedWork.findByIdAndDelete(shareId);

  res.json({ message: "Share deleted successfully" });
});
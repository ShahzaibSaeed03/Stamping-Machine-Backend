import asyncHandler from "express-async-handler";
import SharedWork from "../models/sharedWorkModel.js";
import Work from "../models/workModel.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";
import { sendEmail } from "../utils/sendEmail.js";


/*
SET PASSWORD
*/
export const setSharePassword = asyncHandler(async (req, res) => {

  const { workId, password } = req.body;
  const user = req.user;

  if (!password || password.length < 6)
    throw new Error("Password min 6");

  const work = await Work.findById(workId);
  if (!work) throw new Error("Work not found");

  if (work.id_client.toString() !== user._id.toString())
    throw new Error("Unauthorized");

  let share = await SharedWork.findOne({ id_work: workId });

  const hash = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(32).toString("hex");

  const alreadyHadPassword = !!share?.password_hash;

  if (share) {
    share.password_hash = hash;
    share.sha256_string = token;
    share.end_date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await share.save();
  } else {
    share = await SharedWork.create({
      id_work: workId,
      password_hash: hash,
      sha256_string: token,
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  }

  const shareUrl = `${process.env.FRONTEND_URL}/shared/${share.sha256_string}`;

  /*
  SEND EMAIL
  */
  try {
    await sendEmail({
      to: user.email,
      subject: "Secure Work Share Link Created",
      html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#333">
        <h2>Your Work Has Been Shared</h2>

        <p>You created a password-protected share link.</p>

        <p><b>Work Title:</b> ${work.title}</p>
        <p><b>Reference ID:</b> ${work.displayed_ID}</p>

        <p>
          <a href="${shareUrl}" style="background:#2c7be5;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;">
            Open Shared Work
          </a>
        </p>

        <p>This secure link will expire in 7 days.</p>

        <p>Regards,<br/><b>MyCopyrightally</b></p>
      </div>
    `
    });
  } catch (err) {
    console.log("Email sending failed:", err.message);
  }

  res.json({
    message: "Password set",
    shareId: share.sha256_string,
    shareUrl,
    passwordAlreadySet: alreadyHadPassword
  });

});


/*
GET SHARE LINK
*/
export const createShareLink = asyncHandler(async (req, res) => {

  const { workId } = req.body;

  const share = await SharedWork.findOne({ id_work: workId });
  if (!share) throw new Error("Set password first");

  res.json({
    shareUrl: `${process.env.FRONTEND_URL}/shared/${share.sha256_string}`
  });

});


/*
ACCESS SHARED WORK (LINK)
*/
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


/*
ACCESS BY REFERENCE (FIXED)
*/
export const accessByReference = asyncHandler(async (req, res) => {

  const { reference } = req.body;

  if (!reference) throw new Error("Reference required");

  const work = await Work.findOne({ displayed_ID: reference })
    .populate({
      path: "id_certificate"
    });

  if (!work) throw new Error("Work not found");

  const share = await SharedWork.findOne({ id_work: work._id });

  if (!share) throw new Error("Share link not available");

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
      copyright_owner: work.copyright_owner,
      additional_copyright_owners: work.additional_copyright_owners,
      displayed_ID: work.displayed_ID,
      registration_date: work.registeration_date,
      file_name: work.file_name,
      file_fingerprint: work.file_fingerprint,

      downloadUrl: fileUrl,
      certificateUrl: certUrl,
      otsUrl: otsUrl,

      certificate: {
        id: work.id_certificate?._id,
        name: work.id_certificate?.certificate_name,
        date: work.id_certificate?.registration_date,
        TSA: work.id_certificate?.TSA
      }
    }
  });

});


/*
LIST SHARES
*/
export const listWorkShares = asyncHandler(async (req, res) => {

  const { workId } = req.params;
  const user = req.user;

  const work = await Work.findById(workId);
  if (!work || work.id_client.toString() !== user._id.toString())
    throw new Error("Unauthorized");

  const shares = await SharedWork.find({
    id_work: workId,
    end_date: { $gt: new Date() }
  });

  res.json({
    shares: shares.map(s => ({
      id: s._id,
      shareUrl: `${process.env.FRONTEND_URL}/shared/${s.sha256_string}`,
      expiryDate: s.end_date,
      passwordProtected: !!s.password_hash
    }))
  });

});


/*
DELETE SHARE
*/
export const deleteShare = asyncHandler(async (req, res) => {

  const { shareId } = req.params;
  const user = req.user;

  const share = await SharedWork.findById(shareId).populate("id_work");
  if (!share) throw new Error("Share not found");

  if (share.id_work.id_client.toString() !== user._id.toString())
    throw new Error("Unauthorized");

  await SharedWork.findByIdAndDelete(shareId);

  res.json({ message: "Share deleted" });
});
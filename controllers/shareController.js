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
      <div style="font-family: Arial; line-height:1.6; color:#000;">
        
        <p>This email is a reminder:</p>

        <p>
          The password for your work number <b>${work.displayed_ID}</b> is 
          <b>${password}</b>.
        </p>

        <p>
          To download the corresponding work, please follow the following instructions:
        </p>

        <ol>
          <li>
            Go to the "Access a registered work" page:<br/>
            <a href="https://www.mycopyrightally.com/access-registered-work">
              www.mycopyrightally.com/access-registered-work
            </a>
          </li>
          <li>
            Type the "work reference number" and the password that are in this email.
          </li>
          <li>
            The Certificate of this work will appear on the screen.<br/>
            And you will be able to download the work.
          </li>
        </ol>

      <p>
  You can give these credentials to a third party, but 
  <span style="color:red;">they will be able to download the corresponding work.</span>
</p>

        <br/>

        <p>
          Sincerely,<br/>
          MyCopyrightAlly Team<br/>
          <a href="https://www.mycopyrightally.com">
            www.MyCopyrightAlly.com
          </a>
        </p>

      </div>
    `
  });
} catch (error) {
  console.error(error);
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

  /* VALIDATION */
  if (!reference || !password) {
    throw new Error("Reference and password required");
  }

  /* GET WORK + CERTIFICATE */
  const work = await Work.findOne({ displayed_ID: reference })
    .populate("id_certificate");

  if (!work) {
    throw new Error("Work not found");
  }

  /* GET SHARE */
  const share = await SharedWork.findOne({ id_work: work._id });
  if (!share) {
    throw new Error("Share not available");
  }

  /* CHECK PASSWORD */
  const isMatch = await bcrypt.compare(password, share.password_hash);
  if (!isMatch) {
    throw new Error("Invalid password");
  }

  /* CHECK EXPIRY */
  if (share.end_date < new Date()) {
    throw new Error("Link expired");
  }

  /* GENERATE URLS */
  const fileUrl = work.id_file
    ? await generateSignedUrl(work.id_file)
    : null;

  const certUrl = work.id_certificate?.id_file
    ? await generateSignedUrl(work.id_certificate.id_file)
    : null;

  const otsUrl = work.id_ots
    ? await generateSignedUrl(work.id_ots)
    : null;

  /* RESPONSE (FULL - SAME AS SHARE API) */
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
import asyncHandler from "express-async-handler";
import SharedWork from "../models/sharedWorkModel.js";
import Work from "../models/workModel.js";
import crypto from "crypto";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";

// Create a share link for a work
const createShareLink = asyncHandler(async (req, res) => {
  const { workId, expiryDays = 7 } = req.body; // Default 7 days expiry
  const user = req.user;

  // Find the work and verify ownership
  const work = await Work.findById(workId);
  if (!work) {
    res.status(404);
    throw new Error("Work not found");
  }

  if (work.id_client.toString() !== user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to share this work");
  }

  // Generate a secure random string for the share link
  const sha256_string = crypto.randomBytes(32).toString("hex");

  // Calculate expiry date
  // const end_date = new Date();
  // end_date.setDate(end_date.getDate() + expiryDays);
  const end_date = new Date();
  end_date.setMinutes(end_date.getMinutes() + 10);

  // Create share record
  const sharedWork = await SharedWork.create({
    id_work: workId,
    end_date,
    sha256_string,
  });

  res.status(201).json({
    id: sharedWork._id,
    message: "Share link created successfully",
    shareUrl: `${process.env.FRONTEND_URL}/shared/${sha256_string}`,
    expiryDate: end_date,
  });
});

// Get work by share link
const getSharedWork = asyncHandler(async (req, res) => {
  const { shareId } = req.params;

  // Find the share record
  const sharedWork = await SharedWork.findOne({
    sha256_string: shareId,
  }).populate({
    path: "id_work",
    populate: {
      path: "id_certificate", // Populate the certificate reference to get its id_file
    },
  });

  if (!sharedWork) {
    res.status(404);
    throw new Error("Share link not found or expired");
  }

  // Generate signed URLs for both the work file and certificate
  const fileSignedUrl = await generateSignedUrl(sharedWork.id_work.id_file);
  const certificateSignedUrl = await generateSignedUrl(
    sharedWork.id_work.id_certificate.id_file
  );

  res.json({
    success: true,
    data: {
      title: sharedWork.id_work.title,
      file_name: sharedWork.id_work.file_name,
      downloadUrl: fileSignedUrl,
      certificateUrl: certificateSignedUrl,
    },
  });
});

// List all shares for a work
const listWorkShares = asyncHandler(async (req, res) => {
  const { workId } = req.params;
  const user = req.user;

  // Verify work ownership
  const work = await Work.findById(workId);
  if (!work || work.id_client.toString() !== user._id.toString()) {
    res.status(404);
    throw new Error("Work not found or unauthorized");
  }

  // Get all active shares
  const shares = await SharedWork.find({
    id_work: workId,
    end_date: { $gt: new Date() },
  });

  res.json({
    shares: shares.map((share) => ({
      id: share._id,
      shareUrl: `${process.env.FRONTEND_URL}/shared/${share.sha256_string}`,
      expiryDate: share.end_date,
    })),
  });
});

// Delete a share
const deleteShare = asyncHandler(async (req, res) => {
  const { shareId } = req.params;
  const user = req.user;

  const share = await SharedWork.findById(shareId).populate("id_work");

  if (!share) {
    res.status(404);
    throw new Error("Share not found");
  }

  // Verify ownership of the work
  if (share.id_work.id_client.toString() !== user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to delete this share");
  }

  await SharedWork.findByIdAndDelete(shareId);

  res.json({ message: "Share deleted successfully" });
});

export { createShareLink, getSharedWork, listWorkShares, deleteShare };

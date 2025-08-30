import asyncHandler from "express-async-handler";
import SharedWork from "../models/sharedWorkModel.js";
import Work from "../models/workModel.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSignedUrl } from "../utils/generateSignedUrl.js";

// Create a share link for a work
const createShareLink = asyncHandler(async (req, res) => {
  const { workId, expiryDays = 7, password } = req.body; // Default 7 days expiry, optional password
  const user = req.user;

  // Password is required
  if (!password || password.trim() === "") {
    return res.status(400).json({
      error: "Password is required to create a share link.",
    });
  }

  // Password validation rules
  if (password.length < 6) {
    return res.status(400).json({
      error: "Password must be at least 6 characters long.",
    });
  }

  if (password.length > 50) {
    return res.status(400).json({
      error: "Password must not exceed 50 characters.",
    });
  }

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

  // Hash password if provided
  let password_hash = null;
  if (password) {
    password_hash = await bcrypt.hash(password, 10);
  }

  // Create share record
  const sharedWork = await SharedWork.create({
    id_work: workId,
    end_date,
    sha256_string,
    password_hash,
  });

  res.status(201).json({
    id: sharedWork._id,
    message: "Share link created successfully",
    shareUrl: `${process.env.FRONTEND_URL}/shared/${sha256_string}`,
    expiryDate: end_date,
    passwordProtected: !!password,
  });
});

// Get work by share link
const getSharedWork = asyncHandler(async (req, res) => {
  const { shareId } = req.params;
  const { password } = req.body; // frontend sends password here if required

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

  // If password protection enabled, verify
  if (sharedWork.password_hash) {
    if (!password) {
      res.status(401);
      throw new Error("Password required to access this share");
    }
    const valid = await bcrypt.compare(password, sharedWork.password_hash);
    if (!valid) {
      res.status(403);
      throw new Error("Invalid password");
    }
  }

  // Generate signed URLs for the work file, certificate, and OTS file
  const fileSignedUrl = await generateSignedUrl(sharedWork.id_work.id_file);
  const certificateSignedUrl = await generateSignedUrl(
    sharedWork.id_work.id_certificate.id_file
  );

  // Generate signed URL for OTS file if it exists
  let otsSignedUrl = null;
  if (sharedWork.id_work.id_ots) {
    otsSignedUrl = await generateSignedUrl(sharedWork.id_work.id_ots);
  }

  res.json({
    success: true,
    data: {
      title: sharedWork.id_work.title,
      file_name: sharedWork.id_work.file_name,
      downloadUrl: fileSignedUrl,
      certificateUrl: certificateSignedUrl,
      otsUrl: otsSignedUrl, // Include OTS file URL
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
      passwordProtected: !!share.password_hash,
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

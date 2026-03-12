import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/mailer.js";


// USER REGISTERING CONTROLLER



// SEARCH/GET ALL USER CONTROLLER (GET /api/user?search=)
const allUser = asyncHandler(async (req, res, next) => {
  const keyword = req.query.search
    ? {
      $or: [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
      ],
    }
    : {};

  const users = await User.find(keyword).find({ _id: { $ne: req.user._id } });
  if (users) {
    res.status(200);
    res.send(users);
  } else {
    res.status(400);
    next(new Error("No User Found."));
  }
});
export const getProfile = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id).select("-password");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

const safe = user.toObject();

safe.personalAddress = safe.personalAddress || {
  address1: "",
  address2: "",
  zip: "",
  city: "",
  state: "",
  country: "",
  phone: "",
  profession: "",
  refSource: ""
};

safe.billing = safe.billing || {
  company: "",
  name: "",
  vatNumber: "",
  address1: "",
  address2: "",
  zip: "",
  city: "",
  state: "",
  country: "",
  phone: "",
  sameAsPersonal: false
};

res.status(200).json(safe);});
/* UPDATE PROFILE */

export const updateProfile = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);
  if (!user) throw new Error("User not found");

  const {
    firstName,
    lastName,
    companyName,
    ownerName,
    country,
    state,
    personalAddress,
    billing
  } = req.body;

  /* BASIC */

  user.firstName = firstName ?? user.firstName;
  user.lastName = lastName ?? user.lastName;
  user.companyName = companyName ?? user.companyName;
  user.ownerName = ownerName ?? user.ownerName;
  user.country = country ?? user.country;
  user.state = state ?? user.state;

  /* PERSONAL ADDRESS */

 if (personalAddress) {

  user.personalAddress = {
    ...(user.personalAddress || {}),
    ...personalAddress
  };

}
  /* BILLING */

 if (billing) {

  user.billing = {
    ...(user.billing || {}),
    ...billing
  };

}

  await user.save();

  const safe = user.toObject();
  delete safe.password;

  res.json(safe);
});
export const changePassword = asyncHandler(async (req, res) => {

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Current and new password required");
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  /* CHECK CURRENT PASSWORD */

  const match = await bcrypt.compare(currentPassword, user.password);

  if (!match) {
    res.status(401);
    throw new Error("Current password incorrect");
  }

  /* HASH NEW PASSWORD */

  const hashed = await bcrypt.hash(newPassword, 10);

  user.password = hashed;
  await user.save();

  res.status(200).json({
    message: "Password updated successfully"
  });

});

export const requestEmailChange = asyncHandler(async (req, res) => {

  let { newEmail } = req.body;

  if (!newEmail) {
    res.status(400);
    throw new Error("New email is required");
  }

  /* NORMALIZE EMAIL */

  newEmail = newEmail.trim().toLowerCase();

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  /* PREVENT SAME EMAIL */

  if (user.email.toLowerCase() === newEmail) {
    res.status(400);
    throw new Error("New email cannot be the same as current email");
  }

  /* CHECK IF EMAIL ALREADY USED BY ANOTHER USER */

  const emailExists = await User.findOne({
    email: newEmail,
    _id: { $ne: user._id }
  });

  if (emailExists) {
    res.status(400);
    throw new Error("Email already registered with another account");
  }

  /* GENERATE CODE */

  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();

  /* SAVE TEMP EMAIL */

  user.emailChangeTemp = newEmail;
  user.emailChangeCode = verificationCode;
  user.emailChangeExpires = new Date(Date.now() + 10 * 60 * 1000);

  await user.save();

  console.log("Email change requested by:", user.email);
  console.log("New email:", newEmail);
  console.log("Verification code:", verificationCode);

  /* EMAIL TEMPLATE */

  const verificationTemplate = `
  <div style="font-family:Arial,sans-serif">
    <h2>Email Verification</h2>
    <p>You requested to change your account email.</p>
    <p>Your verification code is:</p>
    <h1 style="letter-spacing:3px">${verificationCode}</h1>
    <p>This code will expire in 10 minutes.</p>
  </div>
  `;

  const securityAlertTemplate = `
  <div style="font-family:Arial,sans-serif">
    <h2>Security Alert</h2>
    <p>An email change was requested for your account.</p>
    <p><strong>Requested new email:</strong> ${newEmail}</p>
    <p>If this was not you please contact support immediately.</p>
  </div>
  `;

  /* SEND EMAILS */

  await Promise.all([
    sendEmail({
      to: newEmail,
      subject: "Verify your new email address",
      html: verificationTemplate
    }),
    sendEmail({
      to: user.email,
      subject: "Security Alert – Email Change Request",
      html: securityAlertTemplate
    })
  ]);

  res.status(200).json({
    message: "Verification code sent to the new email"
  });

});

export const verifyEmailChange = asyncHandler(async (req, res) => {

  const { code } = req.body;

  if (!code) {
    res.status(400);
    throw new Error("Verification code required");
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.emailChangeCode !== code) {
    res.status(400);
    throw new Error("Invalid verification code");
  }

  if (user.emailChangeExpires < new Date()) {
    res.status(400);
    throw new Error("Verification code expired");
  }

  /* UPDATE EMAIL */

  user.email = user.emailChangeTemp;

  user.emailChangeTemp = null;
  user.emailChangeCode = null;
  user.emailChangeExpires = null;

  await user.save();

  console.log("Email updated successfully for user:", user._id);

  res.status(200).json({
    message: "Email updated successfully"
  });

});


export {  allUser };

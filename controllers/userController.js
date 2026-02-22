import express from "express";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import generateToken from "../utils/generateToken.js";
import Counter from "../models/counterModel.js";
import bcrypt from "bcryptjs";


// USER REGISTERING CONTROLLER
const registerUser = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Please enter all required fields: email");
  }
  // CHECKING USER EXISTENCE
  const userExist = await User.findOne({ email: email });
  if (userExist) {
    res.status(400);
    throw new Error("User already Exists.");
  }

  // Generate sequential userSeq atomically
  const counter = await Counter.findOneAndUpdate(
    { _id: "userSeq" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  // CREATING THE USER
  const user = await User.create({
    email,
    creation_date: new Date(),
    userSeq: counter.seq,
  });

  if (user) {
    res.status(200).json({
      id: user._id,
      creation_date: user.creation_date,
      email: user.email,
      userSeq: user.userSeq,
    });
  } else {
    res.status(400);
    throw new Error("User not Created.");
  }
});

// USER LOGIN CONTROLLER
const loginUser = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Please enter all the Fields");
  }
  // GETTING THE USER
  const user = await User.findOne({ email: email });

  if (user) {
    res.status(200).json({
      id: user._id,
      email: user.email,
      name: user.name,
      userSeq: user.userSeq,
      token: generateToken(user._id)
    });
  } else {
    res.status(401);
    throw new Error("Invalid Email or Password Found");
  }
});

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

  res.status(200).json(user);
});
/* UPDATE PROFILE */

export const updateProfile = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const {
    firstName,
    lastName,
    companyName,
    ownerName,
    country,
    state
  } = req.body;

  user.firstName = firstName ?? user.firstName;
  user.lastName = lastName ?? user.lastName;
  user.companyName = companyName ?? user.companyName;
  user.ownerName = ownerName ?? user.ownerName;
  user.country = country ?? user.country;
  user.state = state ?? user.state;

  const updated = await user.save();
const safeUser = updated.toObject();
delete safeUser.password;

  res.status(200).json(updated);
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

  const { newEmail } = req.body;

  if (!newEmail) {
    res.status(400);
    throw new Error("New email required");
  }

  const exists = await User.findOne({ email: newEmail });
  if (exists) {
    res.status(400);
    throw new Error("Email already in use");
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  const user = await User.findById(req.user._id);

  user.emailChangeTemp = newEmail;
  user.emailChangeCode = code;
  user.emailChangeExpires = new Date(Date.now() + 10 * 60 * 1000);

  await user.save();

  res.status(200).json({
    message: "Verification code generated",
    code // remove later when email service added
  });

});

export const verifyEmailChange = asyncHandler(async (req, res) => {

  const { code } = req.body;

  const user = await User.findById(req.user._id);

  if (!user || user.emailChangeCode !== code) {
    res.status(400);
    throw new Error("Invalid code");
  }

  if (user.emailChangeExpires < new Date()) {
    res.status(400);
    throw new Error("Code expired");
  }

  user.email = user.emailChangeTemp;
  user.emailChangeTemp = null;
  user.emailChangeCode = null;
  user.emailChangeExpires = null;

  await user.save();

  res.status(200).json({ message: "Email updated successfully" });
});
export { registerUser, loginUser, allUser };

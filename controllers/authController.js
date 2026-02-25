import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import Counter from "../models/counterModel.js";
import generateToken from "../utils/generateToken.js";

/* ================= REGISTER ================= */

export const registerUser = asyncHandler(async (req, res) => {

  const {
    firstName,
    lastName,
    email,
    password,
    companyName,
    ownerName,
    country,
    state
  } = req.body;

  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error("Required fields missing");
  }

  const exists = await User.findOne({ email });
  if (exists) {
    res.status(400);
    throw new Error("User already exists");
  }

  /* sequence */
  const counter = await Counter.findOneAndUpdate(
    { _id: "userSeq" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const hashed = await bcrypt.hash(password, 10);

  const user = await User.create({
    firstName,
    lastName,
    email,
    password: hashed,
    companyName,
    ownerName,
    country,
    state,
    userSeq: counter.seq,
    subscriptionStatus: "inactive",
    tokens: 0
  });

  res.status(201).json({
    id: user._id,
    email: user.email,
    userSeq: user.userSeq,
    subscriptionStatus: user.subscriptionStatus,
    tokens: user.tokens,
    token: generateToken(user)
  });
});

/* ================= LOGIN ================= */

export const loginUser = asyncHandler(async (req, res) => {

  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  res.status(200).json({
    id: user._id,
    email: user.email,
    userSeq: user.userSeq,
    subscriptionStatus: user.subscriptionStatus,
    tokens: user.tokens,
    token: generateToken(user)
  });
});
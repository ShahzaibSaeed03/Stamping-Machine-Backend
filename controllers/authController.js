import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import Counter from "../models/counterModel.js";
import generateToken from "../utils/generateToken.js";

export const registerUser = asyncHandler(async (req, res) => {

const {
  firstName,
  lastName,
  email,
  password,
  companyName,
  ownerName,
  country,
  state,

  addressLine1,
  addressLine2,
  zip,
  city,
  phone,
  profession,
  refSource,

  billingCompany,
  billingName,
  vatNumber,
  billingAddress1,
  billingAddress2,
  billingZip,
  billingCity,
  billingState,
  billingCountry,
  billingPhone,
  billingSameAsPersonal

} = req.body;

/* VALIDATION */

if (!firstName || !lastName || !email || !password) {
  res.status(400);
  throw new Error("Required fields missing");
}

if (!companyName && !ownerName) {
  res.status(400);
  throw new Error("Company or Owner required");
}

if (country === "USA" && !state) {
  res.status(400);
  throw new Error("State required for USA");
}

/* USER EXISTS */

const exists = await User.findOne({ email });
if (exists) {
  res.status(400);
  throw new Error("User already exists");
}

/* USER SEQUENCE */

const counter = await Counter.findOneAndUpdate(
  { _id: "userSeq" },
  { $inc: { seq: 1 } },
  { new: true, upsert: true }
);

/* HASH */

const hashed = await bcrypt.hash(password, 10);

/* CREATE USER */

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

  personalAddress: {
    address1: addressLine1,
    address2: addressLine2,
    zip,
    city,
    state,
    country,
    phone,
    profession,
    refSource
  },

  billing: {
    company: billingCompany,
    name: billingName,
    vatNumber,
    address1: billingAddress1,
    address2: billingAddress2,
    zip: billingZip,
    city: billingCity,
    state: billingState,
    country: billingCountry,
    phone: billingPhone,
    sameAsPersonal: billingSameAsPersonal
  },

  subscriptionStatus: "inactive",
  tokens: 0
});

res.status(201).json({
  id: user._id,
  email: user.email,
  userSeq: user.userSeq,
  subscriptionStatus: user.subscriptionStatus
});

});
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
    token: generateToken(user._id)
  });
});
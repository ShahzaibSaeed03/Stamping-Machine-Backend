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
    state,
    addressLine1,
    addressLine2,
    zip,
    city,
    phone,
    profession,
    refSource,
  } = req.body;

  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error("Required fields missing");
  }

  let user = await User.findOne({ email });

  const hashedPassword = await bcrypt.hash(password, 10);

  /* ================= EXISTING USER ================= */
  if (user) {

    if (user.subscriptionStatus === "active") {
      res.status(400);
      throw new Error("Account already active. Please login.");
    }

    // update user
    user.firstName = firstName;
    user.lastName = lastName;
    user.password = hashedPassword;
    user.companyName = companyName;
    user.ownerName = ownerName;
    user.country = country;
    user.state = state;

    user.personalAddress = {
      address1: addressLine1 || "",
      address2: addressLine2 || "",
      zip: zip || "",
      city: city || "",
      state: state || "",
      country: country || "",
      phone: phone || "",
      profession: profession || "",
      refSource: refSource || ""
    };

    await user.save();

  } else {

    /* ================= NEW USER ================= */
    const counter = await Counter.findOneAndUpdate(
      { _id: "userSeq" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      companyName,
      ownerName,
      country,
      state,
      userSeq: counter.seq,
      subscriptionStatus: "inactive",
      tokens: 0,
      personalAddress: {
        address1: addressLine1 || "",
        address2: addressLine2 || "",
        zip: zip || "",
        city: city || "",
        state: state || "",
        country: country || "",
        phone: phone || "",
        profession: profession || "",
        refSource: refSource || ""
      }
    });
  }

  /* ================= SAME RESPONSE ================= */
  res.status(200).json({
    id: user._id,
    email: user.email,
    userSeq: user.userSeq,
    subscriptionStatus: user.subscriptionStatus,
    tokens: user.tokens,
    token: generateToken(user),
    message: "Account saved. Proceed to payment." // ✅ SAME MESSAGE
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

  /* ================= PAYMENT CHECK ================= */
  if (user.subscriptionStatus !== "active") {
    return res.status(403).json({
      message: "Payment required. Please complete your subscription.",
      subscriptionStatus: user.subscriptionStatus,
      token: generateToken(user) // optional: allow frontend to continue payment
    });
  }

  /* ================= SUCCESS ================= */
  res.status(200).json({
    id: user._id,
    email: user.email,
    userSeq: user.userSeq,
    subscriptionStatus: user.subscriptionStatus,
    tokens: user.tokens,
    token: generateToken(user)
  });

});
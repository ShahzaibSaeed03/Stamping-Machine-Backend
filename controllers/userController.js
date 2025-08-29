import express from "express";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import generateToken from "../utils/generateToken.js";
import Counter from "../models/counterModel.js";

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
      token: await generateToken(user._id),
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

export { registerUser, loginUser, allUser };

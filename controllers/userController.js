import express from "express";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import generateToken from "../utils/generateToken.js";

// USER REGISTERING CONTROLLER
const registerUser = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Please enter the email field");
  }
  // CHECKING USER EXISTENCE
  const userExist = await User.findOne({ email: email });
  if (userExist) {
    res.status(400);
    throw new Error("User already Exists.");
  }

  // CREATING THE USER
  const user = await User.create({
    email,
    creation_date: new Date(),
  });

  if (user) {
    res.status(200).json({
      ID_user: user.ID_user,
      creation_date: user.creation_date,
      email: user.email,
    });
  } else {
    res.status(400);
    throw new Error("User not Created.");
  }
});

// USER LOGIN CONTROLLER
const loginUser = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Please enter all the Fields");
  }
  // GETTING THE USER
  const user = await User.findOne({ email: email });

  if (user && (await user.matchPassword(password))) {
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      pic: user.pic,
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

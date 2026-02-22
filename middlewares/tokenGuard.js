import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

const tokenGuard = asyncHandler(async (req, res, next) => {

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.tokens <= 0) {
    res.status(403);
    throw new Error("No tokens available");
  }

  next();
});

export default tokenGuard;
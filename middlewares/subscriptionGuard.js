import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

const subscriptionGuard = asyncHandler(async (req, res, next) => {

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  /* NOT ACTIVE */

  if (user.subscriptionStatus !== "active") {
    res.status(403);
    throw new Error("Subscription inactive");
  }

  /* EXPIRED */

  if (user.subscriptionEnd && new Date() > user.subscriptionEnd) {
    res.status(403);
    throw new Error("Subscription expired");
  }

  next();
});

export default subscriptionGuard;
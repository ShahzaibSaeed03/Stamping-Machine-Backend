import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

export const getSubscriptionStatus = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id)
    .select("tokens subscriptionEnd");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.status(200).json({
    remainingTokens: user.tokens || 0,
    nextBillingDate: user.subscriptionEnd || null
  });

});
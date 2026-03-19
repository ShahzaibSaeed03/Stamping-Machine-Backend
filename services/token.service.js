import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";

/* ADD TOKENS (SAFE) */
export const addTokens = async (
  userId,
  amount,
  type,
  note = "",
  invoiceId = null
) => {
  try {
    // 1. Insert transaction FIRST (idempotent guard)
    await TokenTransaction.create({
      user: userId,
      amount,
      type,
      note,
      invoiceId
    });

    // 2. Atomic increment
    await User.updateOne(
      { _id: userId },
      { $inc: { tokens: amount } }
    );

    console.log("✅ Tokens added safely:", amount, invoiceId);

  } catch (err) {
    if (err.code === 11000) {
      console.log("ℹ️ Duplicate prevented:", invoiceId);
      return;
    }
    throw err;
  }
};

/* DEDUCT TOKENS (SAFE) */
export const deductTokens = async (userId, amount, workId = null) => {
  const result = await User.findOneAndUpdate(
    { _id: userId, tokens: { $gte: amount } },
    { $inc: { tokens: -amount } },
    { new: true }
  );

  if (!result) {
    throw new Error("Not enough tokens");
  }

  await TokenTransaction.create({
    user: userId,
    amount: -amount,
    type: "usage",
    workId
  });
};
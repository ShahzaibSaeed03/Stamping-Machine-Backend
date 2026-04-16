import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";

/* ---------------- ADD TOKENS (SAFE + IDEMPOTENT) ---------------- */
export const addTokens = async (
  userId,
  amount,
  type,
  note = "",
  invoiceId = null
) => {
  try {
    const payload = {
      user: userId,
      amount,
      type,
      note,
    };

    // ✅ ONLY add invoiceId if it exists (IMPORTANT FIX)
    if (invoiceId) {
      payload.invoiceId = invoiceId;
    }

    // 1. Insert transaction FIRST (idempotency protection)
    await TokenTransaction.create(payload);

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

/* ---------------- DEDUCT TOKENS (SAFE) ---------------- */
export const deductTokens = async (userId, amount, workId = null) => {

  // 1. Deduct tokens atomically
  const result = await User.findOneAndUpdate(
    { _id: userId, tokens: { $gte: amount } },
    { $inc: { tokens: -amount } },
    { new: true }
  );

  if (!result) {
    throw new Error("Not enough tokens");
  }

  // 2. Record transaction (NO invoiceId here)
  await TokenTransaction.create({
    user: userId,
    amount: -amount,
    type: "usage",
    workId
  });
};
import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";

/* ADD TOKENS */

export const addTokens = async (userId, amount, type, note="", invoiceId=null) => {

  const user = await User.findById(userId);

  user.tokens += amount;
  await user.save();

  await TokenTransaction.create({
    user: userId,
    amount,
    type,
    note,
    invoiceId
  });
};

/* DEDUCT TOKENS */

export const deductTokens = async (userId, amount, workId=null) => {

  const user = await User.findById(userId);

  if (user.tokens < amount) {
    throw new Error("Not enough tokens");
  }

  user.tokens -= amount;
  await user.save();

  await TokenTransaction.create({
    user: userId,
    amount: -amount,
    type: "usage",
    workId
  });
};
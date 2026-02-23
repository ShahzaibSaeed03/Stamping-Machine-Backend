import asyncHandler from "express-async-handler";
import TokenTransaction from "../models/tokenTransactionModel.js";
import { addTokens } from "../services/token.service.js";

/* GET TOKEN HISTORY */
export const getTokenHistory = asyncHandler(async (req, res) => {

  const history = await TokenTransaction
    .find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate("workId", "title");

  res.status(200).json(history);
});

/* TEST */
export const testAddTokens = asyncHandler(async (req, res) => {

  await addTokens(req.user._id, 5, "bonus", "Manual test");

  res.json({ message: "Tokens added" });
});

/* ⭐ REAL BUY TOKENS */
export const buyTokens = asyncHandler(async (req,res)=>{

  const { amount } = req.body;

  if(!amount || amount<=0){
    res.status(400);
    throw new Error("Invalid amount");
  }

  await addTokens(req.user._id, amount, "purchase", "Token purchase");

  res.json({
    message:"Tokens purchased",
    amount
  });

});
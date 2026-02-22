import asyncHandler from "express-async-handler";
import Stripe from "stripe";
import User from "../models/userModel.js";

export const createTokenCheckout = asyncHandler(async (req, res) => {

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(400);
    throw new Error("Stripe not configured");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const { qty } = req.params;

  const user = await User.findById(req.user._id);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",

    ui_mode: "embedded",

    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Buy ${qty} tokens` },
          unit_amount: 100, // $1 per token
        },
        quantity: Number(qty)
      }
    ],

    customer_email: user.email,

    metadata: {
      userId: user._id.toString(),
      tokens: qty
    },

    return_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`
  });

  res.json({ clientSecret: session.client_secret });
});
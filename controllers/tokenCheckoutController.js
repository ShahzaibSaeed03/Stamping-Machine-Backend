import asyncHandler from "express-async-handler";
import Stripe from "stripe";
import User from "../models/userModel.js";

export const createTokenCheckout = asyncHandler(async (req, res) => {

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { qty } = req.params;

  const user = await User.findById(req.user._id);
  if (!user) throw new Error("User not found");

  /* REQUIRE SUBSCRIPTION */

  if (
    user.subscriptionStatus !== "active" ||
    !user.subscriptionEnd ||
    new Date(user.subscriptionEnd).getTime() <= Date.now()
  ) {
    res.status(403);
    throw new Error("Active subscription required to buy tokens");
  }

  const session = await stripe.checkout.sessions.create({

    mode: "payment",

    ui_mode: "embedded",   // ⭐ REQUIRED

    line_items: [
      {
        price: process.env.TOKEN_PRICE_ID,
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

  res.json({
    clientSecret: session.client_secret   // ⭐ IMPORTANT
  });

});
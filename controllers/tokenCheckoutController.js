import asyncHandler from "express-async-handler";
import Stripe from "stripe";
import User from "../models/userModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createTokenCheckout = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);
  if (!user) throw new Error("User not found");

  const qty = Number(req.params.qty);

  if (!qty || qty < 5) {
    return res.status(400).json({ message: "Minimum purchase is 5 tokens" });
  }

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim()
    });

    customerId = customer.id;
    user.stripeCustomerId = customerId;
    await user.save();
  }

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  ui_mode: "embedded",

  customer: customerId,


  billing_address_collection: "required",

  automatic_tax: {
    enabled: true
  },

  invoice_creation: {
    enabled: true
  },

  saved_payment_method_options: {
    payment_method_save: "enabled"
  },

  payment_method_options: {
    card: {
      request_three_d_secure: "automatic"
    }
  },

  line_items: [
    {
      price: process.env.TOKEN_PRICE_ID,
      quantity: qty
    }
  ],

  metadata: {
    userId: user._id.toString(),
    tokens: qty
  },

  return_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`
});
  res.json({
    clientSecret: session.client_secret
  });
});
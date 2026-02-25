import Stripe from "stripe";
import User from "../models/userModel.js";
import { addTokens } from "../services/token.service.js";

export const stripeWebhook = async (req, res) => {

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(400).send("Stripe not configured");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  /* HANDLE CHECKOUT COMPLETED */

  if (event.type === "checkout.session.completed") {

    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (!userId) {
      return res.json({ received: true });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.json({ received: true });
    }

    /* ================= SUBSCRIPTION PAYMENT ================= */

    if (session.mode === "subscription") {

      user.subscriptionStatus = "active";
      user.subscriptionStart = new Date();
      user.subscriptionEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      user.stripeCustomerId = session.customer;
      user.stripeSubscriptionId = session.subscription;

      await user.save();

      await addTokens(user._id, 5, "bonus", "Subscription tokens");
    }

    /* ================= TOKEN PURCHASE ================= */

    if (session.mode === "payment" && session.metadata.tokens) {

      await addTokens(
        user._id,
        Number(session.metadata.tokens),
        "purchase",
        "Token purchase"
      );
    }
  }
  if (event.type === "invoice.payment_succeeded") {

    const invoice = event.data.object;

    const customerId = invoice.customer;

    const user = await User.findOne({
      stripeCustomerId: customerId
    });

    if (user) {

      user.subscriptionStatus = "active";
      user.subscriptionStart = new Date(invoice.period_start * 1000);
      user.subscriptionEnd = new Date(invoice.period_end * 1000);

      await user.save();

      await addTokens(user._id, 5, "bonus", "Monthly subscription tokens");
    }
  }
  res.json({ received: true });
};
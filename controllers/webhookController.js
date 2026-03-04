import Stripe from "stripe";
import User from "../models/userModel.js";
import { addTokens } from "../services/token.service.js";
import { sendPaymentEmail } from "../utils/WorkController/sendPaymentEmail.js";

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

    console.log("🔥 Stripe webhook triggered:", event.type);

  } catch (err) {
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  /* ================= CHECKOUT SESSION COMPLETED ================= */

  if (event.type === "checkout.session.completed") {

    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (!userId) {
      console.log("❌ No userId in checkout session");
      return res.json({ received: true });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ User not found");
      return res.json({ received: true });
    }

    /* ===== YEARLY SUBSCRIPTION ===== */

    if (session.mode === "subscription") {

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );

      user.subscriptionStatus = subscription.status;
      user.subscriptionStart = new Date(subscription.current_period_start * 1000);
      user.subscriptionEnd = new Date(subscription.current_period_end * 1000);
      user.stripeCustomerId = session.customer;
      user.stripeSubscriptionId = subscription.id;

      await user.save();

      await addTokens(user._id, 5, "bonus", "Yearly subscription tokens");

      await sendPaymentEmail({
        email: user.email,
        amount: session.amount_total / 100,
        currency: session.currency,
        type: "Yearly Subscription",
        nextBillingDate: user.subscriptionEnd?.toDateString()
      });

      console.log("✅ Subscription email sent");
    }

    /* ===== TOKEN PURCHASE ===== */

    if (session.mode === "payment" && session.metadata.tokens) {

      await addTokens(
        user._id,
        Number(session.metadata.tokens),
        "purchase",
        "Token purchase"
      );

      await sendPaymentEmail({
        email: user.email,
        amount: session.amount_total / 100,
        currency: session.currency,
        type: `${session.metadata.tokens} Tokens`
      });

      console.log("✅ Token purchase email sent");
    }
  }

  /* ================= PAYMENT INTENT SUCCESS (Backup for Tokens) ================= */

  if (event.type === "payment_intent.succeeded") {

    const paymentIntent = event.data.object;

    const userId = paymentIntent.metadata?.userId;

    if (!userId) {
      console.log("ℹ️ payment_intent without user metadata — ignored");
      return res.json({ received: true });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ User not found (payment_intent)");
      return res.json({ received: true });
    }

    console.log("🟢 payment_intent.succeeded detected");

    await sendPaymentEmail({
      email: user.email,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      type: "Token Purchase"
    });

    console.log("✅ Email sent via payment_intent fallback");
  }

  /* ================= YEARLY RENEWAL ================= */

  if (event.type === "invoice.payment_succeeded") {

    const invoice = event.data.object;

    const user = await User.findOne({
      stripeCustomerId: invoice.customer
    });

    if (user) {

      user.subscriptionStatus = "active";
      user.subscriptionStart = new Date(invoice.period_start * 1000);
      user.subscriptionEnd = new Date(invoice.period_end * 1000);

      await user.save();

      await addTokens(user._id, 5, "bonus", "Yearly renewal tokens");

      await sendPaymentEmail({
        email: user.email,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        type: "Yearly Subscription Renewal",
        nextBillingDate: user.subscriptionEnd?.toDateString()
      });

      console.log("✅ Renewal email sent");
    }
  }

  res.json({ received: true });
};
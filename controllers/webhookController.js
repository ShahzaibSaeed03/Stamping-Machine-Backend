import Stripe from "stripe";
import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";
import { sendPaymentEmail } from "../utils/WorkController/sendPaymentEmail.js";
import { sendSalesEmail } from "../utils/sendSalesEmail.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= ATOMIC TOKEN ADD ================= */
async function addTokensAtomic(userId, amount, invoiceId) {
  const result = await TokenTransaction.updateOne(
    {
      user: userId,
      invoiceId,
      type: "bonus"
    },
    {
      $setOnInsert: {
        user: userId,
        amount,
        type: "bonus",
        note: "Subscription bonus",
        invoiceId
      }
    },
    { upsert: true }
  );

  if (result.upsertedCount === 0) {
    console.log("ℹ️ Tokens already added:", invoiceId);
    return;
  }

  await User.updateOne(
    { _id: userId },
    { $inc: { tokens: amount } }
  );

  console.log("✅ Tokens added:", amount, invoiceId);
}

/* ================= ATOMIC EMAIL ================= */
async function sendEmailAtomic(user, invoice, payload) {
  const result = await TokenTransaction.updateOne(
    {
      user: user._id,
      invoiceId: invoice.id,
      type: "email"
    },
    {
      $setOnInsert: {
        user: user._id,
        amount: 0,
        type: "email",
        note: "email sent",
        invoiceId: invoice.id
      }
    },
    { upsert: true }
  );

  if (result.upsertedCount === 0) {
    console.log("ℹ️ Email already sent:", invoice.id);
    return;
  }

  await sendPaymentEmail(payload);

  await sendSalesEmail({
    userEmail: user.email,
    name: `${user.firstName} ${user.lastName}`,
    amount: payload.amount,
    currency: payload.currency,
    type: payload.type,
    invoiceId: invoice.id,
    receiptUrl: payload.receiptUrl,
    nextBillingDate: payload.nextBillingDate || user.nextBillingDate || null
  });

  console.log("✅ Emails sent once:", invoice.id);
}

/* ================= WEBHOOK ================= */

export const stripeWebhook = async (req, res) => {
  let event;
  const sig = req.headers["stripe-signature"];

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("Stripe webhook:", event.type);
    console.log("EVENT ID:", event.id);

  } catch (err) {
    console.error("❌ Signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      /* ================= CHECKOUT ================= */
      case "checkout.session.completed": {
        const session = event.data.object;

        if (session.mode === "subscription") {
          const user = await User.findById(session.metadata?.userId);

          if (user) {
            user.stripeCustomerId ||= session.customer;
            user.stripeSubscriptionId = session.subscription;
            user.subscriptionStatus = "incomplete";
            await user.save();

            console.log("✅ Subscription initialized");
          }
        }

        break;
      }

      /* ================= PAYMENT SUCCESS ================= */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        console.log("🔍 Processing invoice:", invoice.id);

        const user = await User.findOne({
          stripeCustomerId: invoice.customer
        });

        if (!user) {
          console.log("❌ User not found");
          return res.json({ received: true });
        }

        /* ===== TOKENS ===== */
        if (
          invoice.billing_reason === "subscription_create" ||
          invoice.billing_reason === "subscription_cycle" ||
          invoice.billing_reason === "subscription_update"
        ) {
          await addTokensAtomic(user._id, 5, invoice.id);
        }

        /* ===== PAYMENT TYPE ===== */
        let paymentType = "One-time Payment";

        if (invoice.billing_reason === "subscription_create")
          paymentType = "New Subscription";
        else if (invoice.billing_reason === "subscription_cycle")
          paymentType = "Subscription Renewal";
        else if (invoice.billing_reason === "subscription_update")
          paymentType = "Subscription Update";
        else if (invoice.lines?.data?.[0]?.description?.includes("token"))
          paymentType = "Tokens Purchase";

        /* ===== TRY GET BILLING DATE (fallback) ===== */
        let nextBillingDate = user.nextBillingDate || null;

        await sendEmailAtomic(user, invoice, {
          email: user.email,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          type: paymentType,
          receiptUrl: invoice.hosted_invoice_url,
          nextBillingDate
        });

        break;
      }

      /* ================= SUBSCRIPTION UPDATE (MAIN SOURCE) ================= */
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        console.log("📦 Subscription updated:", subscription.id);

        const user = await User.findOne({
          stripeCustomerId: subscription.customer
        });

        if (!user) {
          console.log("❌ User not found for subscription");
          break;
        }

        const nextBillingDate = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric"
            })
          : null;

        console.log("✅ FINAL BILLING DATE:", nextBillingDate);

        user.nextBillingDate = nextBillingDate;
        user.subscriptionStatus = subscription.status;

        await user.save();

        break;
      }

      /* ================= SUBSCRIPTION CANCEL ================= */
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const user = await User.findOne({
          stripeSubscriptionId: subscription.id
        });

        if (user) {
          user.subscriptionStatus = "canceled";
          user.nextBillingDate = null;
          await user.save();

          console.log("⚠️ Subscription canceled:", user.email);
        }

        break;
      }

      /* ================= IGNORE ================= */
      default:
        console.log("Ignored:", event.type);
        return res.json({ received: true });
    }

    return res.json({ received: true });

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.status(500).send("Webhook failed");
  }
};
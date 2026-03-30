import Stripe from "stripe";
import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";
import { sendPaymentEmail } from "../utils/WorkController/sendPaymentEmail.js";
import { sendSalesEmail } from "../utils/sendSalesEmail.js";
import Counter from "../models/counterModel.js";
import bcrypt from "bcryptjs";

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
    nextBillingDate: payload.nextBillingDate
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

        console.log("🔥 SESSION MODE:", session.mode);

        if (!session.metadata?.formData) {
          console.log("❌ No metadata");
          break;
        }

        const formData = JSON.parse(session.metadata.formData);

        let user = await User.findOne({ email: formData.email });

        if (!user) {

          const counter = await Counter.findOneAndUpdate(
            { _id: "userSeq" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );

          const hashedPassword = await bcrypt.hash(formData.password, 10);

          user = await User.create({
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            password: hashedPassword,
            companyName: formData.companyName,
            ownerName: formData.ownerName,
            country: formData.country,
            state: formData.state,
            userSeq: counter.seq,
            subscriptionStatus: "inactive",
            tokens: 0,
            personalAddress: {
              address1: formData.addressLine1,
              address2: formData.addressLine2,
              zip: formData.zip,
              city: formData.city,
              state: formData.state,
              country: formData.country,
              phone: formData.phone,
              profession: formData.profession,
              refSource: formData.refSource
            },
            stripeCustomerId: session.customer
          });

          console.log("✅ USER CREATED FROM CHECKOUT");
        }

        // ALWAYS LINK
        user.stripeCustomerId ||= session.customer;
        user.stripeSubscriptionId = session.subscription;

        await user.save();

        break;
      }
      /* ================= PAYMENT SUCCESS ================= */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        console.log("🔍 Processing invoice:", invoice.id);

        let user = await User.findOne({
          $or: [
            { stripeCustomerId: invoice.customer },
          ]
        });
        if (!user) {

          console.log("⚠️ User not found → creating from metadata");

          // 🔥 GET SESSION FROM STRIPE
          const sessions = await stripe.checkout.sessions.list({
            customer: invoice.customer,
            limit: 1
          });

          const session = sessions.data[0];

          if (!session?.metadata?.formData) {
            console.log("❌ No metadata found");
            return res.json({ received: true });
          }

          const formData = JSON.parse(session.metadata.formData);

          const counter = await Counter.findOneAndUpdate(
            { _id: "userSeq" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
          );

          const hashedPassword = await bcrypt.hash(formData.password, 10);

          user = await User.create({
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            password: hashedPassword,
            companyName: formData.companyName,
            ownerName: formData.ownerName,
            country: formData.country,
            state: formData.state,
            userSeq: counter.seq,
            subscriptionStatus: "inactive",
            tokens: 0,
            personalAddress: {
              address1: formData.addressLine1,
              address2: formData.addressLine2,
              zip: formData.zip,
              city: formData.city,
              state: formData.state,
              country: formData.country,
              phone: formData.phone,
              profession: formData.profession,
              refSource: formData.refSource
            },
            stripeCustomerId: invoice.customer
          });

          console.log("✅ USER CREATED FROM INVOICE");
        }

        const line = invoice.lines?.data?.[0];

        const isSubscription =
          invoice.billing_reason === "subscription_create" ||
          invoice.billing_reason === "subscription_cycle" ||
          invoice.billing_reason === "subscription_update";

        const isTokenPurchase =
          invoice.billing_reason === "manual" ||
          line?.description?.toLowerCase().includes("token");

        /* ================= SUBSCRIPTION ================= */
        if (isSubscription) {

          await addTokensAtomic(user._id, 5, invoice.id);

          let startDate = null;
          let endDate = null;

          if (line?.period?.start && line?.period?.end) {
            startDate = new Date(line.period.start * 1000);
            endDate = new Date(line.period.end * 1000);
          }

          user.subscriptionStatus = "active";

          if (startDate) user.subscriptionStart = startDate;
          if (endDate) user.subscriptionEnd = endDate;

          await user.save();

          console.log("✅ SUBSCRIPTION UPDATED");
        }

        /* ================= TOKEN PURCHASE ================= */
        if (isTokenPurchase) {

          const tokensPurchased = invoice.amount_paid / 100; // 1$ = 1 token

          await addTokensAtomic(user._id, tokensPurchased, invoice.id);

          console.log("✅ TOKEN PURCHASE:", tokensPurchased);
        }

        /* ================= EMAIL ================= */
        await sendEmailAtomic(user, invoice, {
          email: user.email,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          type: isSubscription ? "Subscription" : "Token Purchase",
          receiptUrl: invoice.hosted_invoice_url,
          nextBillingDate: user.subscriptionEnd || null
        });

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
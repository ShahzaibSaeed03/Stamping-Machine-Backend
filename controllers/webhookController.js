import Stripe from "stripe";
import User from "../models/userModel.js";
import TokenTransaction from "../models/tokenTransactionModel.js";
import WebhookEvent from "../models/webhookEventModel.js";
import { sendPaymentEmail } from "../utils/WorkController/sendPaymentEmail.js";
import { sendSalesEmail } from "../utils/sendSalesEmail.js";
import bcrypt from "bcryptjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= IDPOTENCY (CRITICAL) ================= */
async function isDuplicateEvent(eventId) {
  try {
    await WebhookEvent.create({ eventId });
    return false;
  } catch {
    return true;
  }
}

/* ================= ATOMIC TOKEN ================= */
async function addTokensAtomic(userId, amount, invoiceId) {
  const result = await TokenTransaction.updateOne(
    { user: userId, invoiceId, type: "bonus" },
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

  if (result.upsertedCount === 0) return;

  await User.updateOne(
    { _id: userId },
    { $inc: { tokens: amount } }
  );

  console.log("✅ Tokens added:", amount);
}

/* ================= ATOMIC EMAIL ================= */
async function sendEmailAtomic(user, invoice, payload) {
  const result = await TokenTransaction.updateOne(
    { user: user._id, invoiceId: invoice.id, type: "email" },
    {
      $setOnInsert: {
        user: user._id,
        type: "email",
        invoiceId: invoice.id
      }
    },
    { upsert: true }
  );

  if (result.upsertedCount === 0) return;

  await sendPaymentEmail(payload);

  await sendSalesEmail({
    userEmail: user.email,
    name: `${user.firstName || ""} ${user.lastName || ""}`,
    amount: payload.amount,
    currency: payload.currency,
    type: payload.type,
    invoiceId: invoice.id,
    receiptUrl: payload.receiptUrl,
    nextBillingDate: payload.nextBillingDate
  });

  console.log("✅ Email sent");
}

/* ================= MAIN WEBHOOK ================= */
export const stripeWebhook = async (req, res) => {
  let event;
  const sig = req.headers["stripe-signature"];

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  /* ✅ Prevent duplicate execution */
  if (await isDuplicateEvent(event.id)) {
    console.log("⚠️ Duplicate skipped:", event.id);
    return res.json({ received: true });
  }

  /* ✅ Respond immediately (avoid retry issues) */
  res.json({ received: true });

  try {
    switch (event.type) {

      /* ================= PAYMENT SUCCESS ================= */
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        console.log("🔥 Processing invoice:", invoice.id);

        /* ✅ Always get latest invoice with full data */
        const fullInvoice = await stripe.invoices.retrieve(invoice.id, {
          expand: ["subscription"]
        });

        /* ================= FIND USER ================= */
   let user = await User.findOne({
  stripeCustomerId: fullInvoice.customer
});

if (!user) {
  console.log("⚠️ User not found → getting from subscription");

  const subscription = await stripe.subscriptions.retrieve(
    fullInvoice.subscription
  );

  let formData = null;

  if (subscription.metadata?.formData) {
    try {
      formData = JSON.parse(subscription.metadata.formData);
    } catch (e) {
      console.log("❌ Metadata parse error");
    }
  }

  if (formData) {
    console.log("✅ Creating user from metadata");

    const hashedPassword = await bcrypt.hash(formData.password, 10);

    user = await User.create({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      password: hashedPassword,
      companyName: formData.companyName,
      country: formData.country,
      stripeCustomerId: fullInvoice.customer,
      subscriptionStatus: "inactive",
      tokens: 0
    });

  } else {
    console.log("⚠️ No metadata → fallback user");

    user = await User.create({
      email: fullInvoice.customer_email || `temp_${Date.now()}@noemail.com`,
      stripeCustomerId: fullInvoice.customer,
      subscriptionStatus: "inactive",
      tokens: 0
    });
  }
}

        /* ✅ Fallback user (never fail) */
        if (!user) {
          console.log("⚠️ Creating fallback user");

          user = await User.create({
            email: fullInvoice.customer_email || `temp_${Date.now()}@noemail.com`,
            stripeCustomerId: fullInvoice.customer,
            subscriptionStatus: "inactive",
            tokens: 0
          });
        }

        /* ================= DETECT TYPE ================= */
        const isSubscription =
          fullInvoice.billing_reason === "subscription_create" ||
          fullInvoice.billing_reason === "subscription_cycle" ||
          fullInvoice.billing_reason === "subscription_update";

        const line = fullInvoice.lines?.data?.[0];

        const isTokenPurchase =
          fullInvoice.billing_reason === "manual" ||
          line?.description?.toLowerCase().includes("token");

        /* ================= SUBSCRIPTION ================= */
        if (isSubscription) {

          await addTokensAtomic(user._id, 5, fullInvoice.id);

          let startDate = null;
          let endDate = null;

          if (line?.period?.start && line?.period?.end) {
            startDate = new Date(line.period.start * 1000);
            endDate = new Date(line.period.end * 1000);
          }

          if (user.subscriptionStatus !== "active") {
            user.subscriptionStatus = "active";
          }

          if (startDate) user.subscriptionStart = startDate;
          if (endDate) user.subscriptionEnd = endDate;

          user.stripeSubscriptionId = fullInvoice.subscription;

          await user.save();

          console.log("✅ Subscription activated");
        }

        /* ================= TOKEN PURCHASE ================= */
        if (isTokenPurchase) {
          const tokens = fullInvoice.amount_paid / 100;

          await addTokensAtomic(user._id, tokens, fullInvoice.id);

          console.log("✅ Tokens purchased:", tokens);
        }

        /* ================= EMAIL ================= */
        await sendEmailAtomic(user, fullInvoice, {
          email: user.email,
          amount: fullInvoice.amount_paid / 100,
          currency: fullInvoice.currency,
          type: isSubscription ? "Subscription" : "Token Purchase",
          receiptUrl: fullInvoice.hosted_invoice_url,
          nextBillingDate: user.subscriptionEnd || null
        });

        break;
      }

      /* ================= CANCEL ================= */
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const user = await User.findOne({
          stripeSubscriptionId: subscription.id
        });

        if (user) {
          user.subscriptionStatus = "canceled";
          await user.save();
        }

        break;
      }

      default:
        console.log("Ignored:", event.type);
    }

  } catch (err) {
    console.error("❌ Webhook processing error:", err);
  }
};
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= GET SUBSCRIPTION INFO ================= */

/* ================= GET SUBSCRIPTION INFO ================= */
export const getSubscriptionInfo = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "subscriptionStatus subscriptionStart subscriptionEnd autoRenew tokens stripeSubscriptionId"
  );

  if (!user) throw new Error("User not found");

  // Always sync with Stripe if there's a subscription ID
  if (user.stripeSubscriptionId) {
    try {
      console.log("Syncing subscription with Stripe for user:", user.email);
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

      if (subscription.current_period_start && subscription.current_period_end) {
        const startDate = new Date(subscription.current_period_start * 1000);
        const endDate = new Date(subscription.current_period_end * 1000);

        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          console.log("Updating from Stripe - Start:", startDate.toISOString());
          console.log("Updating from Stripe - End:", endDate.toISOString());

          user.subscriptionStart = startDate;
          user.subscriptionEnd = endDate;
          user.subscriptionStatus = mapStripeStatus(subscription.status);
          user.autoRenew = !subscription.cancel_at_period_end;

          await user.save();
        }
      }
    } catch (error) {
      console.error("Error syncing with Stripe:", error.message);
    }
  }

  const now = new Date();
  const isActive = user.subscriptionStatus === 'active' &&
    user.subscriptionEnd &&
    user.subscriptionEnd > now;

  res.json({
    subscriptionStatus: isActive ? 'active' : user.subscriptionStatus,
    subscriptionStart: user.subscriptionStart,
    nextBillingDate: user.subscriptionEnd,
    autoRenew: user.autoRenew,
    remainingTokens: user.tokens,
    isActive: isActive,
    daysRemaining: user.subscriptionEnd ?
      Math.max(0, Math.ceil((user.subscriptionEnd - now) / (1000 * 60 * 60 * 24))) : 0
  });
});


/* ================= CREATE CHECKOUT SESSION ================= */

export const createCheckoutSession = asyncHandler(async (req, res) => {

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe not configured");
  }

  const user = await User.findById(req.user._id);
  if (!user) throw new Error("User not found");

  let customerId = user.stripeCustomerId;

  /* create customer if not exists */

  if (!customerId) {

    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim()
    });

    customerId = customer.id;

    await User.updateOne(
      { _id: user._id },
      { stripeCustomerId: customerId }
    );
  }

  /* create subscription checkout */

  const session = await stripe.checkout.sessions.create({

    mode: "subscription",
    ui_mode: "embedded",

    customer: customerId,

    billing_address_collection: "required",
    customer_update: { address: "auto" },

    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }
    ],

    metadata: {
      userId: user._id.toString()
    },

    subscription_data: {
      metadata: {
        userId: user._id.toString()
      }
    },

    return_url: `${process.env.CLIENT_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`

  });

  res.json({
    clientSecret: session.client_secret
  });

});


/* ================= CHECKOUT SUCCESS ================= */

export const checkoutSuccess = asyncHandler(async (req, res) => {

  res.json({
    success: true,
    message: "Checkout completed. Subscription will activate shortly."
  });

});


/* ================= CANCEL AUTO RENEW ================= */

export const cancelSubscription = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user?.stripeSubscriptionId) {
    throw new Error("No active subscription");
  }

  await stripe.subscriptions.update(
    user.stripeSubscriptionId,
    { cancel_at_period_end: true }
  );

  user.autoRenew = false;

  await user.save();

  res.json({
    message: "Subscription will cancel at period end"
  });

});


/* ================= RESUME SUBSCRIPTION ================= */

export const resumeSubscription = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user?.stripeSubscriptionId) {
    throw new Error("No subscription");
  }

  await stripe.subscriptions.update(
    user.stripeSubscriptionId,
    { cancel_at_period_end: false }
  );

  user.autoRenew = true;

  await user.save();

  res.json({
    message: "Subscription resumed"
  });

});


/* ================= GET INVOICES ================= */

export const getInvoices = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user?.stripeCustomerId) {
    return res.json([]);
  }

  const invoices = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    limit: 20
  });

  const formatted = invoices.data.map(inv => ({
    id: inv.id,
    amount: inv.amount_paid / 100,
    currency: inv.currency,
    status: inv.status,
    invoicePdf: inv.invoice_pdf,
    hostedInvoiceUrl: inv.hosted_invoice_url,
    date: new Date(inv.created * 1000)
  }));

  res.json(formatted);

});


/* ================= GET CURRENT CARD ================= */

export const getCurrentCard = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user || !user.stripeCustomerId) {
    return res.json(null);
  }

  /* GET CUSTOMER */

  const customer = await stripe.customers.retrieve(user.stripeCustomerId);

  let paymentMethod;

  /* TRY DEFAULT PAYMENT METHOD */

  const defaultPm = customer.invoice_settings?.default_payment_method;

  if (defaultPm) {
    paymentMethod = await stripe.paymentMethods.retrieve(defaultPm);
  } else {

    /* IF NO DEFAULT, GET FIRST CARD */

    const methods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
      limit: 1
    });

    if (!methods.data.length) {
      return res.json(null);
    }

    paymentMethod = methods.data[0];
  }

  if (!paymentMethod || !paymentMethod.card) {
    return res.json(null);
  }

  const card = paymentMethod.card;

  res.json({
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year
  });

});


/* ================= CREATE SETUP INTENT ================= */

export const createSetupIntent = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user?.stripeCustomerId) {
    throw new Error("Stripe customer not found");
  }

  const intent = await stripe.setupIntents.create({
    customer: user.stripeCustomerId
  });

  res.json({
    clientSecret: intent.client_secret
  });

});


/* ================= SET DEFAULT CARD ================= */

export const setDefaultPaymentMethod = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user._id);

  if (!user?.stripeCustomerId) {
    throw new Error("Stripe customer not found");
  }

  const { paymentMethodId } = req.body;

  if (!paymentMethodId) {
    res.status(400);
    throw new Error("Payment method required");
  }
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: user.stripeCustomerId
  });

  await stripe.customers.update(user.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId
    }
  });

  res.json({ success: true });

});
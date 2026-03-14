import Stripe from "stripe";
import User from "../models/userModel.js";
import { addTokens } from "../services/token.service.js";
import { sendPaymentEmail } from "../utils/WorkController/sendPaymentEmail.js";
import { sendSalesEmail } from "../utils/sendSalesEmail.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= STRIPE WEBHOOK ================= */

export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("Stripe webhook:", event.type);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    /* =======================================================
       CHECKOUT COMPLETED
    ======================================================== */

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;

      if (!userId) {
        console.log("No userId in session metadata");
        return res.json({ received: true });
      }

      const user = await User.findById(userId);
      if (!user) {
        console.log("User not found for ID:", userId);
        return res.json({ received: true });
      }

      if (session.mode === "subscription") {
        // Save customer ID if not already set
        if (!user.stripeCustomerId) {
          user.stripeCustomerId = session.customer;
        }

        // Save subscription ID
        if (session.subscription) {
          user.stripeSubscriptionId = session.subscription;
          console.log("✅ Saved subscription ID from checkout:", session.subscription);
        }

        // Set status to incomplete initially
        user.subscriptionStatus = "incomplete";

        await user.save();
        console.log("✅ User updated with incomplete status");
      }

      /* TOKEN PURCHASE */
      if (session.mode === "payment" && session.metadata?.tokens) {
        const tokens = Number(session.metadata.tokens);

        await addTokens(
          user._id,
          tokens,
          "purchase",
          "Token purchase"
        );

        await sendPaymentEmail({
          email: user.email,
          amount: session.amount_total / 100,
          currency: session.currency,
          type: `${tokens} Tokens`
        });

        console.log("Token purchase completed");
      }
    }

    /* =======================================================
       CUSTOMER SUBSCRIPTION CREATED
    ======================================================== */

    if (event.type === "customer.subscription.created") {
      const subscription = event.data.object;

      // Find user by customer ID
      const user = await User.findOne({
        stripeCustomerId: subscription.customer
      });

      if (!user) {
        console.log("No user found for subscription created event - customer:", subscription.customer);
        return res.json({ received: true });
      }

      // Save subscription ID
      user.stripeSubscriptionId = subscription.id;
      user.subscriptionStatus = mapStripeStatus(subscription.status);
      user.autoRenew = !subscription.cancel_at_period_end;

      // Try to set dates if available
      if (subscription.current_period_start && subscription.current_period_end) {
        try {
          const startDate = new Date(subscription.current_period_start * 1000);
          const endDate = new Date(subscription.current_period_end * 1000);

          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            console.log("📅 Setting subscription dates from subscription.created:");
            console.log("Start:", startDate.toISOString());
            console.log("End:", endDate.toISOString());

            user.subscriptionStart = startDate;
            user.subscriptionEnd = endDate;
          }
        } catch (error) {
          console.log("⚠️ Error setting dates in subscription.created:", error.message);
        }
      } else {
        console.log("⚠️ Subscription created without period dates - will fetch from API");
      }

      await user.save();
      console.log("Subscription created with status:", subscription.status, "→", user.subscriptionStatus);
    }

    /* =======================================================
       INVOICE PAYMENT SUCCEEDED - SET DATES WITH 1-YEAR CALCULATION
    ======================================================== */

    if (event.type === "invoice.payment_succeeded") {

      const invoice = event.data.object;

      if (!invoice.subscription) {
        console.log("⚠️ invoice.subscription is undefined in invoice.payment_succeeded; will use user.stripeSubscriptionId from DB as fallback.");
      }

      console.log("\n🔍 Processing invoice.payment_succeeded:", {
        id: invoice.id,
        subscription: invoice.subscription,
        customer: invoice.customer
      });

      // Find the user
      const user = await User.findOne({
        stripeCustomerId: invoice.customer
      });

      if (!user) {
        console.log("❌ No user found for invoice - customer:", invoice.customer);
        return res.json({ received: true });
      }
      /* ADD SUBSCRIPTION BONUS TOKENS */
      if (
        invoice.billing_reason === "subscription_create" ||
        invoice.billing_reason === "subscription_cycle"
      ) {

        await addTokens(
          user._id,
          5,
          "bonus",
          "Monthly subscription bonus"
        );

        console.log("✅ Added 5 subscription bonus tokens");
      }
      console.log("✅ Found user for invoice:", user.email);
      await sendSalesEmail({
        userEmail: user.email,
        name: `${user.firstName} ${user.lastName}`,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        type: "Subscription"
      });

      // Always fetch and set subscription dates from Stripe, retrying if needed
      const fetchAndSetSubscriptionDates = async (user, maxRetries = 3, delayMs = 5000) => {
        let attempt = 0;
        while (attempt < maxRetries) {
          try {
            const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
            let startTimestamp = subscription.current_period_start || subscription.start_date || subscription.created;
            let endTimestamp = subscription.current_period_end || subscription.trial_end;
            if (startTimestamp) {
              const startDate = new Date(startTimestamp * 1000);
              let endDate;
              if (endTimestamp) {
                endDate = new Date(endTimestamp * 1000);
              } else {
                endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);
              }
              if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                user.subscriptionStart = startDate;
                user.subscriptionEnd = endDate;
                user.subscriptionStatus = "active";
                user.autoRenew = !subscription.cancel_at_period_end;
                await user.save();
                console.log("✅ Subscription dates set:", startDate.toISOString(), endDate.toISOString());
                return true;
              }
            }
            console.log(`Attempt ${attempt + 1}: Subscription dates not available yet.`);
          } catch (error) {
            console.error(`Attempt ${attempt + 1}: Error fetching subscription:`, error.message);
          }
          attempt++;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        console.log("❌ Failed to set subscription dates after retries.");
        return false;
      };

      if (user.stripeSubscriptionId) {
        await fetchAndSetSubscriptionDates(user);
      }
    }

    /* =======================================================
       SUBSCRIPTION UPDATED
    ======================================================== */

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;

      console.log("\n🔄 Processing subscription.updated:");
      console.log({
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        customer: subscription.customer
      });

      let user = await User.findOne({
        stripeSubscriptionId: subscription.id
      });

      if (!user) {
        user = await User.findOne({
          stripeCustomerId: subscription.customer
        });

        if (!user) {
          console.log("❌ No user found for subscription update");
          return res.json({ received: true });
        }
      }

      console.log("✅ Found user for subscription update:", user.email);

      // Update dates when available
      let startTimestamp = subscription.current_period_start || subscription.start_date || subscription.created;
      let endTimestamp = subscription.current_period_end || subscription.trial_end;

      if (startTimestamp) {
        try {
          const startDate = new Date(startTimestamp * 1000);
          let endDate;

          if (endTimestamp) {
            endDate = new Date(endTimestamp * 1000);
          } else {
            endDate = new Date(startDate);
            endDate.setFullYear(endDate.getFullYear() + 1);
            console.log("⚠️ No end timestamp in subscription.update, calculated 1 year from start");
          }

          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            console.log("📅 SETTING SUBSCRIPTION DATES FROM subscription.updated:");
            console.log("Start:", startDate.toISOString());
            console.log("End:", endDate.toISOString());

            user.subscriptionStart = startDate;
            user.subscriptionEnd = endDate;
            user.subscriptionStatus = mapStripeStatus(subscription.status);
            user.autoRenew = !subscription.cancel_at_period_end;

            if (!user.stripeSubscriptionId) {
              user.stripeSubscriptionId = subscription.id;
            }

            await user.save();

            console.log("✅✅✅ SUBSCRIPTION DATES SUCCESSFULLY UPDATED FROM subscription.updated:");
            console.log("Start:", user.subscriptionStart.toISOString());
            console.log("End:", user.subscriptionEnd.toISOString());
          }
        } catch (error) {
          console.error("❌ Error setting dates:", error.message);
        }
      } else {
        console.log("⚠️ Subscription update has no start date");
      }
    }

    /* =======================================================
       SUBSCRIPTION CANCELLED
    ======================================================== */

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      const user = await User.findOne({
        stripeSubscriptionId: subscription.id
      });

      if (!user) return res.json({ received: true });

      user.subscriptionStatus = "canceled";
      user.autoRenew = false;

      if (subscription.current_period_end) {
        try {
          const endDate = new Date(subscription.current_period_end * 1000);
          if (!isNaN(endDate.getTime())) {
            user.subscriptionEnd = endDate;
          }
        } catch (error) {
          console.log("⚠️ Error setting end date:", error.message);
        }
      }

      await user.save();
      console.log("Subscription canceled");
    }

    /* =======================================================
       PAYMENT SUCCESS EMAIL
    ======================================================== */

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const userId = paymentIntent.metadata?.userId;

      if (!userId) return res.json({ received: true });

      const user = await User.findById(userId);
      if (!user) return res.json({ received: true });

      await sendPaymentEmail({
        email: user.email,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        type: "Payment"
      });

      console.log("Payment email sent");
    }

    return res.json({ received: true });

  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).send("Webhook handler failed");
  }
};

/* Helper function to map Stripe status to your enum */
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    'active': 'active',
    'past_due': 'past_due',
    'unpaid': 'unpaid',
    'canceled': 'canceled',
    'incomplete': 'incomplete',
    'incomplete_expired': 'incomplete_expired',
    'trialing': 'trialing',
    'paused': 'paused'
  };

  return statusMap[stripeStatus] || 'inactive';
}
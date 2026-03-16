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
       CHECKOUT COMPLETED - Process token purchases only
       NO EMAILS HERE - Let invoice.payment_succeeded handle emails
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

      // Handle SUBSCRIPTION checkout
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
        
        // NO EMAIL HERE - invoice.payment_succeeded will handle it
      }

      // Handle TOKEN PURCHASE checkout
      if (session.mode === "payment" && session.metadata?.tokens) {
        const tokens = Number(session.metadata.tokens);

        // Check if this checkout was already processed
        if (!user.processedCheckouts) {
          user.processedCheckouts = [];
        }
        
        if (!user.processedCheckouts.includes(session.id)) {
          // Add tokens with description only (no invoice ID for token purchases)
          await addTokens(
            user._id,
            tokens,
            "purchase",
            "Token purchase",
            null // Pass null for invoiceId to avoid unique index issues
          );

          // Mark this checkout as processed
          user.processedCheckouts.push(session.id);
          await user.save();

          console.log("✅ Token purchase completed - tokens added:", tokens);
        } else {
          console.log("⚠️ Checkout already processed for tokens, skipping:", session.id);
        }
        
        // NO EMAIL HERE - invoice.payment_succeeded will handle it
      }
    }

    /* =======================================================
       INVOICE PAYMENT SUCCEEDED - SINGLE SOURCE OF TRUTH FOR EMAILS
       This is the ONLY place where emails are sent
    ======================================================== */

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;

      console.log("\n🔍 Processing invoice.payment_succeeded:", {
        id: invoice.id,
        subscription: invoice.subscription,
        customer: invoice.customer,
        billing_reason: invoice.billing_reason,
        hosted_invoice_url: invoice.hosted_invoice_url
      });

      // Find the user
      const user = await User.findOne({
        stripeCustomerId: invoice.customer
      });

      if (!user) {
        console.log("❌ No user found for invoice - customer:", invoice.customer);
        return res.json({ received: true });
      }

      console.log("✅ Found user for invoice:", user.email);

      // Initialize tracking arrays if they don't exist
      if (!user.processedInvoices) {
        user.processedInvoices = [];
      }
      if (!user.processedEmails) {
        user.processedEmails = [];
      }

      // Check if this invoice was already processed (prevents duplicate processing)
      const isInvoiceProcessed = user.processedInvoices.includes(invoice.id);
      
      // ===== PROCESS SUBSCRIPTION LOGIC (if applicable) =====
      if ((invoice.billing_reason === "subscription_create" || 
           invoice.billing_reason === "subscription_cycle" ||
           invoice.billing_reason === "subscription_update") && !isInvoiceProcessed) {
        
        console.log("📋 This is a subscription invoice - processing subscription logic");

        /* ADD SUBSCRIPTION BONUS TOKENS */
        await addTokens(
          user._id,
          5,
          "bonus",
          "Monthly subscription bonus",
          invoice.id // Pass the invoice ID
        );
        
        console.log("✅ Added 5 subscription bonus tokens for invoice:", invoice.id);

        // Fetch and set subscription dates
        if (user.stripeSubscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
            
            if (subscription.current_period_start && subscription.current_period_end) {
              const startDate = new Date(subscription.current_period_start * 1000);
              const endDate = new Date(subscription.current_period_end * 1000);
              
              user.subscriptionStart = startDate;
              user.subscriptionEnd = endDate;
              user.subscriptionStatus = mapStripeStatus(subscription.status);
              user.autoRenew = !subscription.cancel_at_period_end;
              
              console.log("✅ Subscription dates set:", startDate.toISOString(), endDate.toISOString());
            }
          } catch (error) {
            console.error("Error fetching subscription:", error.message);
          }
        }

        // Mark invoice as processed
        user.processedInvoices.push(invoice.id);
      } else if (invoice.billing_reason === "subscription_create" || 
                invoice.billing_reason === "subscription_cycle" ||
                invoice.billing_reason === "subscription_update") {
        console.log("⚠️ Subscription invoice already processed, skipping token addition:", invoice.id);
      }

      // ===== SEND SINGLE EMAIL RECEIPT (ONLY IF NOT ALREADY SENT) =====
      if (!user.processedEmails.includes(invoice.id)) {
        
        // Get receipt URL
        const receiptUrl = invoice.hosted_invoice_url || invoice.invoice_pdf;
        
        // Determine next billing date for subscriptions
        let nextBillingDate;
        if (user.subscriptionEnd) {
          nextBillingDate = user.subscriptionEnd.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        }

        // Determine payment type
        let paymentType = "One-time Payment";
        if (invoice.billing_reason === "subscription_create") {
          paymentType = "New Subscription";
        } else if (invoice.billing_reason === "subscription_cycle") {
          paymentType = "Subscription Renewal";
        } else if (invoice.billing_reason === "subscription_update") {
          paymentType = "Subscription Update";
        } else if (invoice.lines?.data[0]?.description?.toLowerCase().includes("token")) {
          paymentType = "Tokens Purchase";
        }

        // Send SINGLE payment receipt to customer
        await sendPaymentEmail({
          email: user.email,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          type: paymentType,
          nextBillingDate: nextBillingDate,
          receiptUrl: receiptUrl
        });
        console.log("✅ SINGLE receipt email sent to customer for invoice:", invoice.id);

        // Send SINGLE sales email to team
        await sendSalesEmail({
          userEmail: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          type: paymentType,
          invoiceId: invoice.id,
          receiptUrl: receiptUrl,
          nextBillingDate: nextBillingDate
        });
        console.log("✅ SINGLE sales email sent to team for invoice:", invoice.id);

        // Mark email as processed
        user.processedEmails.push(invoice.id);
      } else {
        console.log("⚠️ Email already sent for this invoice, skipping:", invoice.id);
      }

      // Save all user changes
      await user.save();
    }

    /* =======================================================
       CUSTOMER SUBSCRIPTION CREATED - Update user data only
       NO EMAILS HERE
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

      // Save subscription data
      user.stripeSubscriptionId = subscription.id;
      user.subscriptionStatus = mapStripeStatus(subscription.status);
      user.autoRenew = !subscription.cancel_at_period_end;

      // Set dates if available
      if (subscription.current_period_start && subscription.current_period_end) {
        try {
          const startDate = new Date(subscription.current_period_start * 1000);
          const endDate = new Date(subscription.current_period_end * 1000);

          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            user.subscriptionStart = startDate;
            user.subscriptionEnd = endDate;
          }
        } catch (error) {
          console.log("⚠️ Error setting dates in subscription.created:", error.message);
        }
      }

      await user.save();
      console.log("Subscription created with status:", subscription.status, "→", user.subscriptionStatus);
      
      // NO EMAIL HERE - invoice.payment_succeeded will handle it
    }

    /* =======================================================
       SUBSCRIPTION UPDATED - Update user data only
       NO EMAILS HERE
    ======================================================== */

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;

      console.log("\n🔄 Processing subscription.updated:", {
        id: subscription.id,
        status: subscription.status
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

      // Update dates
      let startTimestamp = subscription.current_period_start || subscription.start_date || subscription.created;
      let endTimestamp = subscription.current_period_end || subscription.trial_end;

      if (startTimestamp && endTimestamp) {
        try {
          const startDate = new Date(startTimestamp * 1000);
          const endDate = new Date(endTimestamp * 1000);

          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            user.subscriptionStart = startDate;
            user.subscriptionEnd = endDate;
            user.subscriptionStatus = mapStripeStatus(subscription.status);
            user.autoRenew = !subscription.cancel_at_period_end;

            if (!user.stripeSubscriptionId) {
              user.stripeSubscriptionId = subscription.id;
            }

            await user.save();
            console.log("✅ Subscription dates updated");
          }
        } catch (error) {
          console.error("❌ Error setting dates:", error.message);
        }
      }
      
      // NO EMAIL HERE - This is just data update
    }

    /* =======================================================
       SUBSCRIPTION CANCELLED - Update user data only
       NO EMAILS HERE
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
      
      // NO EMAIL HERE - cancellation emails can be handled separately if needed
    }

    /* =======================================================
       IGNORED EVENTS - No emails, no processing
    ======================================================== */

    // Explicitly ignore these events to prevent any accidental email sending
    if (event.type === "payment_intent.succeeded" || 
        event.type === "invoice.payment.paid" || 
        event.type === "invoice_payment.paid") {
      console.log(`ℹ️ ${event.type} received - ignoring to prevent duplicates`);
      return res.json({ received: true });
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
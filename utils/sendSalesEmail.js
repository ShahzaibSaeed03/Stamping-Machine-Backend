import { sendEmail } from "../utils/mailer.js";

export const sendSalesEmail = async ({
  userEmail,
  name,
  amount,
  currency,
  type
}) => {

  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2>New Payment Received</h2>

      <p><strong>Customer:</strong> ${name}</p>
      <p><strong>Email:</strong> ${userEmail}</p>

      <p><strong>Purchase Type:</strong> ${type}</p>

      <p><strong>Amount:</strong> ${amount} ${currency.toUpperCase()}</p>

      <p>Payment completed successfully via Stripe.</p>
    </div>
  `;

  await sendEmail({
    to: process.env.SALES_EMAIL,
    subject: "New Payment Received",
    html
  });

};
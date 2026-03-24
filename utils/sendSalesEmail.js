import { sendEmail } from "../utils/mailer.js";

export const sendSalesEmail = async ({
  userEmail,
  name,
  amount,
  currency,
  type
}) => {

  const cleanType = type.replace(/^new\s+/i, "");

  const amountText = amount
    ? `<p><strong>Amount:</strong> ${amount} ${currency.toUpperCase()}</p>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2>${cleanType} Event</h2>

      <p><strong>Customer:</strong> ${name}</p>
      <p><strong>Email:</strong> ${userEmail}</p>

      <p><strong>Event Type:</strong> ${cleanType}</p>

      ${amountText}

      <p>Event processed successfully.</p>
    </div>
  `;

  await sendEmail({
    to: process.env.SALES_EMAIL,
    subject: `Payment: ${cleanType} - ${amount} ${currency.toUpperCase()}`,
    html
  });

};
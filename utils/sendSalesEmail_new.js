import { sendEmail } from "../utils/mailer.js";

export const sendSalesEmail = async ({
  userEmail,
  name,
  amount,
  currency,
  type,
  invoiceId,
  receiptUrl,
  nextBillingDate
}) => {
  try {
    const html = `
      <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto;">
        <div style="background:#466d94; color:#fff; padding:18px 24px; font-size:18px; font-weight:600; border-radius:8px 8px 0 0;">
          New Payment Received
        </div>
        
        <div style="background:#ffffff; padding:24px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px;">
          
          <h2 style="margin-top:0; color:#111827;">Payment Details</h2>
          
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr>
              <td style="padding:8px 0; color:#555; width:150px;"><strong>Customer:</strong></td>
              <td style="padding:8px 0;">${name}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#555;"><strong>Email:</strong></td>
              <td style="padding:8px 0;">${userEmail}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#555;"><strong>Purchase Type:</strong></td>
              <td style="padding:8px 0;">${type}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#555;"><strong>Amount:</strong></td>
              <td style="padding:8px 0;">${amount} ${currency.toUpperCase()}</td>
            </tr>
            ${invoiceId ? `
            <tr>
              <td style="padding:8px 0; color:#555;"><strong>Invoice ID:</strong></td>
              <td style="padding:8px 0;">${invoiceId}</td>
            </tr>
            ` : ''}
            ${nextBillingDate ? `
            <tr>
              <td style="padding:8px 0; color:#555;"><strong>Next Billing:</strong></td>
              <td style="padding:8px 0;">${nextBillingDate}</td>
            </tr>
            ` : ''}
          </table>
          
          ${receiptUrl ? `
          <div style="text-align:center; margin:30px 0;">
            <a href="${receiptUrl}" 
               target="_blank"
               style="background:#10b981; color:#fff; padding:12px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block;">
               View Full Receipt
            </a>
          </div>
          ` : ''}
          
          <p style="color:#6b7280; font-size:14px; margin-top:20px; padding-top:20px; border-top:1px solid #e5e7eb;">
            Payment completed successfully via Stripe at ${new Date().toLocaleString()}.
          </p>
        </div>
        
        <div style="text-align:center; padding:15px; font-size:12px; color:#777;">
          © ${new Date().getFullYear()} MyCopyrightAlly - Internal Sales Notification
        </div>
      </div>
    `;

    await sendEmail({
      to: process.env.SALES_EMAIL,
      subject: `New Payment: ${type} - ${amount} ${currency.toUpperCase()}`,
      html
    });

    console.log("✅ Sales email sent to:", process.env.SALES_EMAIL);
  } catch (err) {
    console.error("❌ Sales email failed:", err.message);
  }
};
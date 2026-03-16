import nodemailer from "nodemailer";

export const sendPaymentEmail = async ({
  email,
  amount,
  currency,
  type,
  nextBillingDate,
  receiptUrl
}) => {

  try {

    if (process.env.ENABLE_EMAIL !== "true") return;

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f7fb;padding:30px">

      <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:8px;overflow:hidden">

        <div style="background:#466d94;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">
          Payment Confirmation
        </div>

        <div style="padding:24px">

          <p style="font-size:16px;margin-bottom:20px">
            Thank you for your payment. Your transaction has been completed successfully.
          </p>

          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">

            <tr>
              <td style="padding:8px 0;color:#555"><strong>Service</strong></td>
              <td style="text-align:right">${type}</td>
            </tr>

            <tr>
              <td style="padding:8px 0;color:#555"><strong>Amount Paid</strong></td>
              <td style="text-align:right">${amount} ${currency.toUpperCase()}</td>
            </tr>

            ${
              nextBillingDate
                ? `
                <tr>
                  <td style="padding:8px 0;color:#555"><strong>Next Billing Date</strong></td>
                  <td style="text-align:right">${nextBillingDate}</td>
                </tr>
                `
                : ""
            }

          </table>

          ${
            receiptUrl
              ? `
              <div style="text-align:center;margin:30px 0">
                <a href="${receiptUrl}"
                   style="background:#10b981;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                   Download Payment Receipt
                </a>
              </div>
              `
              : ""
          }

          <p style="margin-top:25px;font-size:14px;color:#666">
            You can manage your subscription or billing information anytime from your account dashboard.
          </p>

          <div style="text-align:center;margin-top:20px">
            <a href="https://instagrace.com/billing"
               style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">
               Manage Billing
            </a>
          </div>

        </div>

        <div style="background:#f3f4f6;text-align:center;padding:15px;font-size:12px;color:#777">
          © ${new Date().getFullYear()} MyCopyrightAlly
        </div>

      </div>

    </div>
    `;

    await transporter.sendMail({
      from: `"MyCopyrightAlly" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Payment Receipt",
      html
    });

    console.log("Payment email sent to:", email);

  } catch (err) {
    console.error("Payment email failed:", err.message);
  }

};
import nodemailer from "nodemailer";

export const sendPaymentEmail = async ({
  email,
  amount,
  currency,
  type,
  nextBillingDate
}) => {
  try {

    if (process.env.ENABLE_EMAIL !== "true") return;

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false, // true only for port 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const html = `
    <div style="font-family:Arial;max-width:600px;margin:auto;padding:20px">
      <h2>Payment Successful</h2>

      <p>Thank you for your payment.</p>

      <h3>Payment Summary</h3>
      <ul>
        <li><strong>Type:</strong> ${type}</li>
        <li><strong>Amount:</strong> ${amount} ${currency.toUpperCase()}</li>
        ${nextBillingDate ? `<li><strong>Next Billing Date:</strong> ${nextBillingDate}</li>` : ""}
      </ul>

      <p>You can manage your subscription anytime at:</p>

      <a href="https://instagrace.com/billing"
         style="background:#2563eb;color:#fff;padding:10px 15px;text-decoration:none;border-radius:5px;">
         Go to Billing
      </a>

      <p style="margin-top:30px;font-size:12px;color:#666;">
        © ${new Date().getFullYear()} MyCopyrightAlly
      </p>
    </div>
    `;

    const info = await transporter.sendMail({
      from: `"MyCopyrightAlly" <${process.env.EMAIL_FROM}>`,
      to: email,
      replyTo: "info@mycopyrightally.com",
      subject: "Payment Confirmation",
      html
    });

    console.log("✅ Payment email sent:", info.response);

  } catch (err) {
    console.error("❌ Payment email failed:", err.message);
  }
};
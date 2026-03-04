import nodemailer from "nodemailer";

export const sendConfirmationEmail = async (email, workTitle) => {
  try {
    if (process.env.ENABLE_EMAIL !== "true") {
      console.log("Email sending is disabled.");
      return;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false, // TLS (port 587)
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Work Protected</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, Helvetica, sans-serif;">
      <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:30px auto; background:#ffffff; border-radius:8px; overflow:hidden;">
        
        <!-- Header -->
        <tr>
          <td style="background:#111827; padding:20px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:22px;">
              MyCopyrightAlly
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px;">
            <h2 style="color:#111827; margin-top:0;">
              Your Work is Now Protected
            </h2>

            <p style="color:#4b5563; font-size:15px; line-height:1.6;">
              Your work <strong>${workTitle}</strong> has been successfully registered and securely stored in our system.
            </p>

            <p style="color:#4b5563; font-size:15px; line-height:1.6;">
              You can access your Copyright Certificate and file anytime by visiting your dashboard:
            </p>

            <div style="text-align:center; margin:25px 0;">
              <a href="https://mycopyrightally.com/my-original-works"
                 style="background:#2563eb; color:#ffffff; padding:12px 20px; text-decoration:none; border-radius:5px; font-size:15px; display:inline-block;">
                View My Original Works
              </a>
            </div>

            <p style="color:#4b5563; font-size:15px; line-height:1.6;">
              From your dashboard, you can:
            </p>

            <ul style="color:#4b5563; font-size:15px; line-height:1.6;">
              <li>Download your Certificate</li>
              <li>Download your original file</li>
              <li>Share the file securely</li>
              <li>Set password protection for third-party access</li>
            </ul>

            <p style="color:#4b5563; font-size:15px; line-height:1.6;">
              Your file and certificate are permanently stored and can be accessed at any time.
            </p>

            <p style="color:#4b5563; font-size:15px;">
              Thank you for trusting us.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f3f4f6; padding:20px; text-align:center; font-size:13px; color:#6b7280;">
            © ${new Date().getFullYear()} MyCopyrightAlly<br/>
            <a href="https://mycopyrightally.com" style="color:#2563eb; text-decoration:none;">
              https://mycopyrightally.com
            </a>
          </td>
        </tr>

      </table>
    </body>
    </html>
    `;

    const message = {
      from: `"MyCopyrightAlly" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Your work has been successfully protected",
      text: `Your work "${workTitle}" has been successfully protected. Visit https://mycopyrightally.com/my-original-works to access your certificate and file.`,
      html: htmlBody,
    };

    const info = await transporter.sendMail(message);
    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Email sending failed:", error.message);
  }
};
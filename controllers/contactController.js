import asyncHandler from "express-async-handler";
import { sendEmail } from "../utils/mailer.js";

export const contactUs = asyncHandler(async (req, res) => {

  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400);
    throw new Error("All fields are required");
  }

const html = `
<div style="background:#f4f6f9;padding:40px 0;font-family:Arial,Helvetica,sans-serif">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1)">

          <!-- HEADER -->
          <tr>
            <td style="background:#466d94;color:#ffffff;padding:20px;text-align:center;font-size:22px;font-weight:bold">
              MyCopyrightAlly
            </td>
          </tr>

          <!-- TITLE -->
          <tr>
            <td style="padding:25px 30px 10px 30px;font-size:20px;color:#333;font-weight:bold">
              New Contact Form Message
            </td>
          </tr>

          <!-- USER INFO -->
          <tr>
            <td style="padding:10px 30px;color:#555;font-size:15px;line-height:1.6">

              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Subject:</strong> ${subject}</p>

            </td>
          </tr>

          <!-- MESSAGE -->
          <tr>
            <td style="padding:10px 30px">

              <div style="background:#f5f7fa;border-radius:8px;padding:20px;font-size:15px;color:#444;line-height:1.6">
                ${message}
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:25px 30px 30px 30px;font-size:13px;color:#888;text-align:center">

              This message was submitted via the contact form on<br>
              <strong>MyCopyrightAlly</strong>

              <br><br>

              <span style="color:#aaa">© ${new Date().getFullYear()} MyCopyrightAlly</span>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</div>
`;

  await sendEmail({
    to: process.env.SALES_EMAIL,
    subject: `Contact Form: ${subject}`,
    html
  });

  /* Console log when email is sent */
  console.log("Contact form email sent");
  console.log("From:", name, "-", email);
  console.log("Subject:", subject);

  res.status(200).json({
    message: "Your message has been sent successfully"
  });

});
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendEmail = async ({ to, subject, html }) => {

  try {

    const info = await transporter.sendMail({
      from: `"My Copyright Evidence" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html
    });

    console.log("EMAIL SENT SUCCESSFULLY");
    console.log("TO:", to);
    console.log("MESSAGE ID:", info.messageId);
    console.log("SMTP RESPONSE:", info.response);

  } catch (error) {

    console.error("EMAIL SEND FAILED");
    console.error(error);

  }

};
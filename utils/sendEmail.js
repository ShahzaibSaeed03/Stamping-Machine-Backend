import nodemailer from "nodemailer";

console.log("Email service loaded");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,           // e.g. smtp.gmail.com
  port: Number(process.env.EMAIL_PORT),   // e.g. 587
  secure: false,                          // true if port 465
  auth: {
    user: process.env.EMAIL_USER,         // full email address
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error) => {
  if (error) {
    console.log("SMTP ERROR:", error);
  } else {
    console.log("SMTP SERVER READY");
  }
});

export const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: `"MyCopyrightally" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  };

  const info = await transporter.sendMail(mailOptions);

  console.log("EMAIL SENT SUCCESSFULLY");
  console.log("TO:", to);
  console.log("MESSAGE ID:", info.messageId);

  return info;
};
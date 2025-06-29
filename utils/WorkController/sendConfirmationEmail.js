import nodemailer from "nodemailer";

export const sendConfirmationEmail = async (email, workTitle) => {
  const transporter = nodemailer.createTransport({
    service: "YourEmailProvider",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const message = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your work has been protected",
    text: `Your work "${workTitle}" is now protected and saved in our database. Visit www.wheneverr.com/my-original-works to view or download your certificate.`,
  };

  await transporter.sendMail(message);
};

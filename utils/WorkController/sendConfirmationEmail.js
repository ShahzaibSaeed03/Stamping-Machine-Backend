import nodemailer from "nodemailer";

export const sendConfirmationEmail = async (email, workTitle) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlBody = `
    <p>Your work <strong>${workTitle}</strong> is now protected and saved in our database.</p>
    <p>
      To view the Copyright Certificate of this work, you have to connect to our website.<br/>
      Then, go to the “My Original Works” screen, using the menu or this link:<br/>
      <a href="https://www.wheneverr.com/my-original-works">www.wheneverr.com/my-original-works</a>
    </p>
    <p>You will be able to:</p>
    <ul>
      <li>See and download the Certificate</li>
      <li>Download your copyrighted file</li>
      <li>Share this file with somebody</li>
      <li>Create a password (in case you would like a third party to access the file via our website)</li>
    </ul>
    <p>
      The file and its Certificate are stored in our database.<br/>
      You can access them anytime.
    </p>
  `;

  const message = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your work has been protected",
    text: `Your work "${workTitle}" is now protected and saved in our database. Visit www.wheneverr.com/my-original-works to view or download your certificate.`,
    html: htmlBody,
  };

  await transporter.sendMail(message);
};

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for port 465, false for others
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

async function sendVerificationEmail(toEmail, name, token) {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const verifyLink = `${baseUrl}/api/auth/verify-email?token=${token}`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Verify your email address',
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for signing up. Please verify your email address by clicking the link below:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

module.exports = { sendVerificationEmail };

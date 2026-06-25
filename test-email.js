require('dotenv').config();
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});
transporter.sendMail({
  from: '"不遠露營系統" <' + process.env.GMAIL_USER + '>',
  to: 'd97941005@ntu.edu.tw',
  subject: 'Test Email',
  text: 'This is a test email'
}).then(info => console.log('Sent:', info.messageId))
  .catch(err => console.error('Error:', err));

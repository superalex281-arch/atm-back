import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Parse json bodies
app.use(express.json());

// CORS configuration supporting dynamic origins or environment config
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Input validation and sanitization middleware
const validateAndSanitizeInput = (req, res, next) => {
  const { name, phone, issue } = req.body;

  if (name === undefined || phone === undefined || issue === undefined) {
    return res.status(400).json({ error: 'Validation error: name, phone, and issue fields are required.' });
  }

  if (typeof name !== 'string' || typeof phone !== 'string' || typeof issue !== 'string') {
    return res.status(400).json({ error: 'Validation error: All input fields must be strings.' });
  }

  // Remove potential HTML tags to sanitize inputs
  const cleanName = name.replace(/<[^>]*>/g, '').trim();
  const cleanPhone = phone.replace(/<[^>]*>/g, '').trim();
  const cleanIssue = issue.replace(/<[^>]*>/g, '').trim();

  // Validate Name: 1-100 characters
  if (cleanName.length < 1 || cleanName.length > 100) {
    return res.status(400).json({ error: 'Validation error: Name must be between 1 and 100 characters.' });
  }

  // Validate Phone: basic structure check allowing optional +, numbers, space, parentheses, and dashes (7-25 characters)
  const phoneRegex = /^\+?[0-9\s\-()]{7,25}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return res.status(400).json({ error: 'Validation error: Invalid phone number format.' });
  }

  // Validate Issue: 1-2000 characters
  if (cleanIssue.length < 1 || cleanIssue.length > 2000) {
    return res.status(400).json({ error: 'Validation error: Issue must be between 1 and 2000 characters.' });
  }

  req.validatedBody = {
    name: cleanName,
    phone: cleanPhone,
    issue: cleanIssue
  };

  next();
};

// Route to handle consultation requests
app.post('/api/consultation', validateAndSanitizeInput, async (req, res) => {
  const { name, phone, issue } = req.validatedBody;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Configuration Error: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.');
    return res.status(500).json({ error: 'Server configuration error. Failed to route request.' });
  }

  const timestamp = new Date().toISOString();
  
  // Escape helper for standard telegram markdown (*, _, `, [)
  const escapeMarkdown = (str) => {
    return str.replace(/([*_`\[])/g, '\\$1');
  };

  const markdownMessage = [
    `*🚨 New Consultation Request*`,
    ``,
    `*Client Details:*`,
    `• *Name:* ${escapeMarkdown(name)}`,
    `• *Phone:* ${escapeMarkdown(phone)}`,
    `• *Timestamp:* ${escapeMarkdown(timestamp)}`,
    ``,
    `*Client Issue:*`,
    `\`\`\`text`,
    `${escapeMarkdown(issue)}`,
    `\`\`\``
  ].join('\n');

  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: markdownMessage,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('Telegram API response error:', data);
      return res.status(502).json({ error: 'Failed to send alert to Telegram.', details: data.description });
    }

    return res.status(200).json({ success: true, message: 'Consultation request routed successfully.' });
  } catch (error) {
    console.error('Error forwarding to Telegram:', error);
    return res.status(500).json({ error: 'Internal server error while processing request.' });
  }
});

export default app;


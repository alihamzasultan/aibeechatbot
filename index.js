import express from 'express';
import cors from 'cors';
import { openai } from './open.js';
import fs from 'fs';



const app = express();
app.use(cors());
app.use(express.json());

let faqData;
try {
  faqData = JSON.parse(fs.readFileSync('aibee.json', 'utf8'));
} catch (error) {
  console.error('Error loading FAQ data:', error);
  faqData = [];
}

const customPrompt = `
You are an AI assistant for an Bee company named "AiBee".
This is the information and question answers you need to assist users based on this data:
${JSON.stringify(faqData, null, 2)}
show all options excluding those with only YES and No options. 
`;

const formatLinksAsHTML = (text) => {
    // Regex to detect URLs in text
    const urlRegex = /(?:\[(.*?)\]\((https?:\/\/[^\s)]+)\))/g;

    // Replace Markdown-style links with properly formatted HTML links or image tags
    return text.replace(urlRegex, (match, linkText, url) => {
        if (url.startsWith('https://nexreality.io/') && /\/\d{2}\/$/.test(url)) {
            return `<a href="${url}" target="_blank" style="color: #007bff; text-decoration: none; font-size: 14px; font-weight: bold;">
                        Click to view
                    </a>`;
        }
        if (url.includes('tinyurl.com')) {
            return `<div style="text-align: center; margin-top: 20px;">
                        <img src="${url}" alt="Image" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease, box-shadow 0.3s ease;">
                    </div>`;
        }
        return `<a href="${url}" target="_blank">${linkText}</a>`;
    });
};

const sessions = {};  // Store active sessions
import nodemailer from 'nodemailer';


app.post('/send-email', async (req, res) => {
    const { name, email, description } = req.body;

    if (!name || !email || !description) {
        return res.status(400).send({ message: 'All fields are required.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER, // Your email
                pass: process.env.EMAIL_PASS, // Your app password
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'honeyspringsbeellc@gmail.com', // Replace with the recipient's email
            subject: `New Message from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\nDescription: ${description}`,
        };

        await transporter.sendMail(mailOptions);
        res.status(200).send({ message: 'Email sent successfully.' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).send({ message: 'Failed to send email.' });
    }
});
// Main API endpoint for chat
app.post('/api/chat', async (req, res) => {
    const { message, sessionId } = req.body; // Include sessionId in the request

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Initialize session if it doesn't exist
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            history: []
        };
    }

    try {
        // Add the current user message to session history
        sessions[sessionId].history.push({ role: 'user', content: message });

        // Combine customPrompt with the user's message and previous history
        const conversationHistory = sessions[sessionId].history.map(
            (entry) => `${entry.role}: ${entry.content}`
        ).join('\n');

        const fullPrompt = `${customPrompt}\nConversation History:\n${conversationHistory}`;

        // Request OpenAI to respond based on the full history
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.5,
            messages: [
                {
                    role: 'system',
                    content: fullPrompt
                }
            ]
        });

        const gptResponse = response.choices[0].message.content;

        // Add GPT's response to session history
        sessions[sessionId].history.push({ role: 'assistant', content: gptResponse });

        // Format response
        const formattedMessage = formatLinksAsHTML(gptResponse);

        // Check if response contains "name" or "email"
        const showForm = /name|email/i.test(gptResponse);

        // If no form is needed, send a general message
        if (!showForm) {
            return res.json({
                message: formattedMessage,
                source: 'The Ice Butcher Expertise',
                showForm: false
            });
        }

        // If a form is needed, return a message asking for more info
        return res.json({
            message: 'Please provide more information (name or email) to proceed.',
            source: 'The Ice Butcher Expertise',
            showForm: true
        });

    } catch (error) {
        console.error('Error processing chat:', error);
        // Send a more specific message when there's an error
        res.status(500).json({
            error: 'Internal server error. Please try again later, or provide more details if possible.'
        });
    }
});


// Endpoint to end the session and clear history
app.post('/api/end-session', (req, res) => {
    const { sessionId } = req.body;

    if (sessions[sessionId]) {
        delete sessions[sessionId];  // Clear session history
        return res.json({ message: 'Session ended and history cleared.' });
    } else {
        return res.status(400).json({ error: 'Session not found.' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

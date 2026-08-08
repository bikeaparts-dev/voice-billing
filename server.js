const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path'); // <-- 1. path मॉड्यूल जोड़ा गया
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// <-- 2. HTML फाइल और static फाइलों को सर्व करने के लिए ये 2 लाइनें जोडी गईं
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key"
});

// System Prompt
const SYSTEM_PROMPT = `
You are an expert Indian shop billing assistant. 
Parse the input into structured JSON for an invoice.

Extract:
- customer_name (string or null)
- items array, where each item has:
  - item_name (string)
  - quantity (number)
  - unit (string: kg, liter, pcs, packet, etc.)
  - rate (number, default to 0 if not explicitly mentioned in input)
- paid_amount (number or 0)

Calculate item total as (quantity * rate) if rate is provided.

Return ONLY valid JSON matching this schema:
{
  "customer_name": "string or null",
  "items": [
    { 
      "item_name": "string", 
      "quantity": number, 
      "unit": "string",
      "rate": number,
      "total": number
    }
  ],
  "paid_amount": number or 0
}
`;

// Helper Function for Calculation
function calculateInvoiceTotals(invoiceData) {
  let grandTotal = 0;
  
  invoiceData.items = invoiceData.items.map(item => {
    const rate = item.rate || 0;
    const total = item.quantity * rate;
    grandTotal += total;
    return {
      ...item,
      rate: rate,
      total: total
    };
  });

  invoiceData.grand_total = grandTotal;
  invoiceData.balance_due = grandTotal - (invoiceData.paid_amount || 0);
  return invoiceData;
}

// 1. API Endpoint for Real Audio Processing
app.post('/api/voice-billing', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

    const audioFilePath = req.file.path;
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: "whisper-1",
      language: "hi"
    });

    fs.unlinkSync(audioFilePath);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcription.text }
      ]
    });

    let invoiceData = JSON.parse(completion.choices[0].message.content);
    invoiceData = calculateInvoiceTotals(invoiceData);

    res.json({ success: true, rawText: transcription.text, data: invoiceData });
  } catch (error) {
    res.status(500).json({ error: "Server Error / Invalid API Key" });
  }
});

// 2. API Endpoint for Demo Testing (Without Mic)
app.post('/api/test-billing', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_api_key_here" || process.env.OPENAI_API_KEY === "dummy_key") {
      let mockData = {
        customer_name: "रमेश कुमार (Test)",
        items: [
          { item_name: "आटा", quantity: 5, unit: "kg", rate: 40, total: 200 },
          { item_name: "फॉर्च्यून तेल", quantity: 2, unit: "liter", rate: 140, total: 280 },
          { item_name: "चीनी", quantity: 1, unit: "kg", rate: 45, total: 45 }
        ],
        paid_amount: 200
      };
      mockData = calculateInvoiceTotals(mockData);
      return res.json({ success: true, rawText: text, data: mockData });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
      ]
    });

    let invoiceData = JSON.parse(completion.choices[0].message.content);
    invoiceData = calculateInvoiceTotals(invoiceData);

    res.json({ success: true, rawText: text, data: invoiceData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
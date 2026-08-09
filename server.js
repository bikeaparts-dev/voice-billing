const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');
const { OpenAI } = require('openai');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key"
});

// 🏪 ऑटो-डिटेक्ट डेटाबेस (Default Price List for Kirana Items)
const ITEM_PRICE_DATABASE = {
  "आटा": 40,
  "मैदा": 45,
  "शक्कर": 42,
  "चीनी": 42,
  "तेल": 140,
  "फॉर्च्यून तेल": 145,
  "चावल": 60,
  "दाल": 120,
  "नमक": 20,
  "चायपत्ती": 280
};

// Simple Fallback Parser (बिना OpenAI Key के आपकी ही आवाज़ से टेबल बनाने के लिए)
function parseVoiceTextLocally(text) {
  let custMatch = text.match(/(?:ग्राहक|नाम|के नाम)\s+([a-zA-Bh-zA-Z\u0900-\u097F]+)/i);
  let customerName = custMatch ? custMatch[1] : "नकद ग्राहक";

  let items = [];
  // Regex pattern to extract quantity, unit, and item name
  let regex = /(\d+)\s*(किलो|kg|लीटर|ग्राम|पैकेट|लीटर|ग्राम)\s+([\u0900-\u097F\w\s]+?)(?=(\d+\s*(?:किलो|kg|लीटर|ग्राम|पैकेट)|बिल|करो|$))/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    let qty = parseFloat(match[1]);
    let unit = match[2];
    let itemName = match[3].trim().replace(/(रुपये|की दर|का|के|में)/g, '').trim();

    // Check if rate was mentioned
    let rateMatch = text.match(new RegExp(itemName + `.*?(\\d+)\\s*(?:रुपये|रु|rate)`, 'i'));
    let rate = rateMatch ? parseFloat(rateMatch[1]) : (ITEM_PRICE_DATABASE[itemName] || 40);

    items.push({
      item_name: itemName,
      quantity: qty,
      unit: unit,
      rate: rate,
      total: qty * rate
    });
  }

  if(items.length === 0) {
    items.push({ item_name: "आइटम (Auto-Detected)", quantity: 1, unit: "pcs", rate: 50, total: 50 });
  }

  let grandTotal = items.reduce((sum, item) => sum + item.total, 0);

  return {
    customer_name: customerName,
    items: items,
    grand_total: grandTotal
  };
}

const SYSTEM_PROMPT = `
You are a smart Indian billing assistant. Extract items and pricing.
Item Prices DB for auto-detect if rate is not spoken: ${JSON.stringify(ITEM_PRICE_DATABASE)}

Extract:
- customer_name
- items array with: item_name, quantity, unit, rate (if mentioned use spoken rate, else auto-detect from DB, fallback 40), total.

Return JSON:
{
  "customer_name": "string",
  "items": [{"item_name": "string", "quantity": number, "unit": "string", "rate": number, "total": number}],
  "grand_total": number
}
`;

// API Endpoint for Billing Processing
app.post('/api/test-billing', async (req, res) => {
  try {
    const { text } = req.body;
    
    // If OpenAI API key is missing or dummy, use local dynamic voice parser (No fixed Ramesh data)
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "dummy_key") {
      let parsedData = parseVoiceTextLocally(text);
      return res.json({ success: true, rawText: text, data: parsedData });
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
    res.json({ success: true, rawText: text, data: invoiceData });
  } catch (error) {
    let parsedData = parseVoiceTextLocally(req.body.text || "");
    res.json({ success: true, rawText: req.body.text, data: parsedData });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
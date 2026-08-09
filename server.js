const express = require('express');
const cors = require('cors');
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key"
});

// फालतू शब्दों को हटाने की सूची
const STOP_WORDS = ["और", "तथा", "रुपये", "रु", "रुपया", "लिखो", "बिल", "बनाओ", "करना", "का", "के", "की", "नाम"];

// Local Smart Parser (अगर OpenAI Key न हो या लोकल में चले)
function parseVoiceToTable(text) {
  let custName = "नकद ग्राहक";
  let items = [];

  // 1. ग्राहक का नाम निकालना
  let nameMatch = text.match(/(?:ग्राहक|नाम|के नाम)\s+([a-zA-Bh-zA-Z\u0900-\u097F]+)/i);
  if (nameMatch && !STOP_WORDS.includes(nameMatch[1])) {
    custName = nameMatch[1];
  } else {
    let firstWord = text.trim().split(/\s+/)[0];
    if (firstWord && isNaN(firstWord) && !STOP_WORDS.includes(firstWord)) {
      custName = firstWord;
    }
  }

  // 2. सामान, मात्रा और रेट निकालना
  // Regex pattern: [मात्रा] [इकाई] [सामान नाम] [रेट]
  let regex = /(\d+(?:\.\d+)?)\s*(किलो|kg|लीटर|ग्राम|पैकेट)?\s+([\u0900-\u097F\w\s]+?)\s+(\d+)\s*(?:रुपये|रु)?/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    let qty = parseFloat(match[1]);
    let unit = match[2] || "किलो";
    let rawItem = match[3].trim();
    let rate = parseFloat(match[4]);

    // फालतू शब्द साफ करें
    let cleanItem = rawItem.split(/\s+/).filter(w => !STOP_WORDS.includes(w)).join(" ");

    if (cleanItem) {
      items.push({
        item_name: cleanItem,
        quantity: qty,
        unit: unit,
        rate: rate,
        total: qty * rate
      });
    }
  }

  // अगर रेगुलर पैटर्न न मिले तो सिम्पल बैकअप
  if (items.length === 0) {
    let parts = text.split(/(?:और|,)/);
    parts.forEach(part => {
      let nums = part.match(/\d+/g);
      let words = part.split(/\s+/).filter(w => !STOP_WORDS.includes(w) && isNaN(w));
      if (words.length > 0 && nums && nums.length >= 2) {
        let q = parseFloat(nums[0]);
        let r = parseFloat(nums[1]);
        items.push({
          item_name: words.join(" "),
          quantity: q,
          unit: "किलो",
          rate: r,
          total: q * r
        });
      }
    });
  }

  let grandTotal = items.reduce((sum, i) => sum + i.total, 0);

  return {
    customer_name: custName,
    items: items,
    grand_total: grandTotal
  };
}

const SYSTEM_PROMPT = `
You are an expert Indian billing system. 
Extract exact customer name, items, quantities, units, rates, and totals from the user's spoken text.
Ignore filler words like "और", "रुपये", "लिखो", "के नाम".

Return strict JSON:
{
  "customer_name": "string",
  "items": [
    { "item_name": "string", "quantity": number, "unit": "string", "rate": number, "total": number }
  ],
  "grand_total": number
}
`;

app.post('/api/test-billing', async (req, res) => {
  try {
    const { text } = req.body;

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "dummy_key") {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ]
      });
      let invoiceData = JSON.parse(completion.choices[0].message.content);
      return res.json({ success: true, rawText: text, data: invoiceData });
    }

    // Fallback to local parser
    let parsedData = parseVoiceToTable(text);
    res.json({ success: true, rawText: text, data: parsedData });

  } catch (error) {
    let parsedData = parseVoiceToTable(req.body.text || "");
    res.json({ success: true, rawText: req.body.text, data: parsedData });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
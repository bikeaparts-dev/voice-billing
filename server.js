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

// फालतू शब्दों की लिस्ट जो कभी सामान का नाम नहीं हो सकते
const IGNORE_WORDS = ["और", "तथा", "रुपये", "रु", "रुपया", "लिखो", "बिल", "बनाओ", "करना", "का", "के", "की", "नाम", "ग्राम", "किलो", "लीटर", "पैकेट"];

function cleanAndParseText(text) {
  let custName = "नकद ग्राहक";
  let nameMatch = text.match(/(?:ग्राहक|नाम|के नाम)\s+([a-zA-Bh-zA-Z\u0900-\u097F]+)/i);
  if (nameMatch && !IGNORE_WORDS.includes(nameMatch[1])) {
    custName = nameMatch[1];
  }

  let items = [];
  // Regex to extract quantity, unit, item, rate
  let regex = /(\d+(?:\.\d+)?)\s*(किलo|kg|लीटर|ग्राम|पैकेट|किलो)?\s+([\u0900-\u097F\w\s]+?)\s+(\d+)\s*(?:रुपये|रु)?/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    let qty = parseFloat(match[1]);
    let unit = match[2] || "किलो";
    let rawItem = match[3].trim();
    let rate = parseFloat(match[4]);

    // फालतू शब्दों को हटाओ
    let cleanItem = rawItem.split(/\s+/).filter(word => !IGNORE_WORDS.includes(word)).join(" ");

    if (cleanItem.length > 0) {
      items.push({
        item_name: cleanItem,
        quantity: qty,
        unit: unit,
        rate: rate,
        total: qty * rate
      });
    }
  }

  if (items.length === 0) {
    // Backup fallback pattern
    let simpleMatches = text.split(/(?:और|,)/);
    simpleMatches.forEach(part => {
      let nums = part.match(/\d+/g);
      let words = part.split(/\s+/).filter(w => !IGNORE_WORDS.includes(w) && isNaN(w));
      if (words.length > 0 && nums && nums.length >= 2) {
        items.push({
          item_name: words[words.length - 1],
          quantity: parseFloat(nums[0]),
          unit: "इकाई",
          rate: parseFloat(nums[1]),
          total: parseFloat(nums[0]) * parseFloat(nums[1])
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
You are a expert Indian bill parser.
Extract customer_name and items from the Hindi voice text.
Ignore words like "और", "रुपये", "लिखो", "के नाम".

Return JSON format strictly:
{
  "customer_name": "string",
  "items": [
    { "item_name": "exact item name only", "quantity": number, "unit": "kg/liter/pcs", "rate": number, "total": number }
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

    // Smart Local Clean Parser
    let parsedData = cleanAndParseText(text);
    res.json({ success: true, rawText: text, data: parsedData });

  } catch (error) {
    let parsedData = cleanAndParseText(req.body.text || "");
    res.json({ success: true, rawText: req.body.text, data: parsedData });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
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

// OpenAI Instance
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key"
});

const SYSTEM_PROMPT = `
You are a smart Indian billing assistant expert in converting Hindi speech to structured invoice data.

Your task:
1. Extract customer name if mentioned (e.g. "सोनू के नाम" -> "सोनू"). Default to "नकद ग्राहक" if not mentioned.
2. Extract all items, quantities, units (e.g., किलो, लीटर, पैकेट, kg), rates (per unit price), and total amount for each item.
3. Ignore filler words like "और", "रुपये", "लिखो", "बिल बनाओ", "का", "के".

Strict Output Format (JSON only):
{
  "customer_name": "Customer Name",
  "items": [
    {
      "item_name": "Item Name",
      "quantity": 2,
      "unit": "किलो",
      "rate": 40,
      "total": 80
    }
  ],
  "grand_total": 80
}
`;

app.post('/api/test-billing', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: "No voice text provided" });
    }

    // OpenAI GPT Call
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Convert this speech to bill data: "${text}"` }
      ]
    });

    let invoiceData = JSON.parse(completion.choices[0].message.content);

    res.json({
      success: true,
      rawText: text,
      data: invoiceData
    });

  } catch (error) {
    console.error("OpenAI Error:", error.message);
    res.status(500).json({
      success: false,
      error: "AI Processing Error",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 AI Voice Billing Server running on port ${PORT}`));
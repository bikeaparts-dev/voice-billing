const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// फालतू शब्दों की लिस्ट (इन्हें सामान के नाम में नहीं जोड़ा जाएगा)
const STOP_WORDS = ["और", "तथा", "रुपये", "रु", "रुपया", "लिखो", "बिल", "बनाओ", "करना", "का", "के", "की", "नाम"];

// Local Smart Parser (100% Free - No OpenAI needed)
function parseVoiceToTable(text) {
  let custName = "नकद ग्राहक";
  let items = [];

  // 1. ग्राहक का नाम निकालना (उदा. "रमेश के नाम")
  let nameMatch = text.match(/(?:ग्राहक|नाम|के नाम)\s+([a-zA-Bh-zA-Z\u0900-\u097F]+)/i);
  if (nameMatch && !STOP_WORDS.includes(nameMatch[1])) {
    custName = nameMatch[1];
  } else {
    let firstWord = text.trim().split(/\s+/)[0];
    if (firstWord && isNaN(firstWord) && !STOP_WORDS.includes(firstWord)) {
      custName = firstWord;
    }
  }

  // 2. सामान, मात्रा, इकाई और रेट निकालना
  // पैटर्न: [मात्रा] [इकाई] [सामान] [रेट]
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

  // अगर पैटर्न डायरेक्ट न मिले तो सिम्पल स्प्लिट बैकअप
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

app.post('/api/test-billing', (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: "कोई आवाज़ रिकॉर्ड नहीं हुई" });
    }

    let parsedData = parseVoiceToTable(text);

    res.json({
      success: true,
      rawText: text,
      data: parsedData
    });

  } catch (error) {
    console.error("Parser Error:", error.message);
    res.status(500).json({
      success: false,
      error: "प्रोसेसिंग में समस्या आई",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Free Local Voice Billing Server running on port ${PORT}`));
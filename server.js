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

// फालतू शब्द जो ग्राहक नाम या सामान नाम में नहीं जाने चाहिए
const STOP_WORDS = ["और", "तथा", "रुपये", "रु", "रुपया", "लिखो", "बिल", "बनाओ", "करना", "का", "के", "की", "नाम", "अगला", "फिर"];

// Multi-Item Smart Parser
function parseVoiceToTable(text) {
  let custName = "नकद ग्राहक";
  let items = [];

  // 1. ग्राहक का नाम निकालना (उदा. "सोनू के नाम")
  let nameMatch = text.match(/(?:ग्राहक|नाम|के नाम)\s+([a-zA-Bh-zA-Z\u0900-\u097F]+)/i);
  if (nameMatch && !STOP_WORDS.includes(nameMatch[1])) {
    custName = nameMatch[1];
  } else {
    let firstWord = text.trim().split(/\s+/)[0];
    if (firstWord && isNaN(firstWord) && !STOP_WORDS.includes(firstWord)) {
      custName = firstWord;
    }
  }

  // 2. टेक्स्ट को अलग-अलग आइटम्स के टुकड़ों में तोड़ना ("और", "फिर", "अगला" या कॉमा के आधार पर)
  let rawSegments = text.split(/(?:और|फिर|तथा|अगला|,|\bएवं\b)/gi);

  rawSegments.forEach(segment => {
    segment = segment.trim();
    if (!segment) return;

    // Pattern: [मात्रा] [इकाई] [सामान] [रेट]
    let regexFull = /(\d+(?:\.\d+)?)\s*(किलो|kg|लीटर|ग्राम|पैकेट|नग|पीस)?\s+([\u0900-\u097F\w\s]+?)\s+(\d+)\s*(?:रुपये|रु)?/gi;
    let match = regexFull.exec(segment);

    if (match) {
      let qty = parseFloat(match[1]);
      let unit = match[2] || "किलो";
      let rawItem = match[3].trim();
      let rate = parseFloat(match[4]);

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
    } else {
      // अगर मात्रा + सामान + रेट बिना यूनिट के बोला गया हो (उदा. "2 आटा 40")
      let numbers = segment.match(/\d+(?:\.\d+)?/g);
      let words = segment.split(/\s+/).filter(w => !STOP_WORDS.includes(w) && isNaN(w));

      if (words.length > 0 && numbers && numbers.length >= 2) {
        let q = parseFloat(numbers[0]);
        let r = parseFloat(numbers[1]);
        items.push({
          item_name: words.join(" "),
          quantity: q,
          unit: "किलो",
          rate: r,
          total: q * r
        });
      }
    }
  });

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
app.listen(PORT, () => console.log(`🚀 Free Multi-Row Voice Billing Server running on port ${PORT}`));
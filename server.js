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

// Units Normalization Dictionary
const UNIT_MAP = {
  'kg': 'किलो', 'kilo': 'किलो', 'किग्रा': 'किलो', 'किलो': 'किलो', 'किलोग्राम': 'किलो',
  'g': 'ग्राम', 'gram': 'ग्राम', 'grams': 'ग्राम', 'ग्राम': 'ग्राम',
  'l': 'लीटर', 'liter': 'लीटर', 'litre': 'लीटर', 'लीटर': 'लीटर', 'लीटरों': 'लीटर',
  'ml': 'मिलीलीटर', 'milliliter': 'मिलीलीटर', 'मिलीलीटर': 'मिलीलीटर',
  'packet': 'पैकेट', 'packets': 'पैकेट', 'pkt': 'पैकेट', 'पैकेट': 'पैकेट', 'पैक': 'पैकेट',
  'piece': 'पीस', 'pieces': 'पीस', 'pc': 'पीस', 'pcs': 'पीस', 'पीस': 'पीस', 'नग': 'पीस',
  'box': 'बॉक्स', 'boxes': 'बॉक्स', 'बॉक्स': 'बॉक्स', 'डिब्बा': 'बॉक्स', 'डिब्बे': 'बॉक्स',
  'bottle': 'बोतल', 'bottles': 'बोतल', 'बोतल': 'बोतल', 'बोतलें': 'बोतल',
  'carton': 'कार्टून', 'cartons': 'कार्टून', 'कार्टून': 'कार्टून',
  'dozen': 'दर्जन', 'dozens': 'दर्जन', 'दर्जन': 'दर्जन',
  'bundle': 'बंडल', 'bundles': 'बंडल', 'बंडल': 'बंडल'
};

// Command and stop words to clean from item names
const STOP_WORDS = [
  "और", "फिर", "अगला", "तथा", "एवं", "रुपये", "रुपया", "रु", "rs", "rupees", "rupee",
  "बिल", "बनाओ", "करना", "नाम", "ग्राहक", "का", "के", "की", "को", "लिए", "में", "से", "था", "है"
];

// Helper to sanitize words
function cleanWord(w) {
  return w ? w.toLowerCase().trim() : "";
}

function isStopWordOrUnitOrNum(w) {
  if (!w) return true;
  let lower = cleanWord(w);
  if (!isNaN(lower)) return true;
  if (UNIT_MAP[lower]) return true;
  if (STOP_WORDS.includes(lower)) return true;
  return false;
}

// Preprocess Hindi quantity words into decimal numbers
function preprocessHindiQuantities(str) {
  let s = " " + str + " ";

  // Multi-word fractions
  s = s.replace(/\bपौने\s+दो\b/gi, " 1.75 ");
  s = s.replace(/\bपौने\s+तीन\b/gi, " 2.75 ");
  s = s.replace(/\bपौने\s+चार\b/gi, " 3.75 ");
  s = s.replace(/\bपौने\s+(\d+)\b/gi, (m, n) => ` ${parseFloat(n) - 0.25} `);

  s = s.replace(/\bसवा\s+दो\b/gi, " 2.25 ");
  s = s.replace(/\bसवा\s+तीन\b/gi, " 3.25 ");
  s = s.replace(/\bसवा\s+(\d+)\b/gi, (m, n) => ` ${parseFloat(n) + 0.25} `);

  s = s.replace(/\bसाढ़े\s+तीन\b/gi, " 3.5 ");
  s = s.replace(/\bसाढ़े\s+चार\b/gi, " 4.5 ");
  s = s.replace(/\bसाढ़े\s+(\d+)\b/gi, (m, n) => ` ${parseFloat(n) + 0.5} `);

  s = s.replace(/\bढाई\b/gi, " 2.5 ");
  s = s.replace(/\bडेढ़\b|\bडेढ\b/gi, " 1.5 ");
  s = s.replace(/\bसवा\b/gi, " 1.25 ");
  s = s.replace(/\bआधा\b|\bआधी\b/gi, " 0.5 ");
  s = s.replace(/\bपाव\b|\bपावा\b/gi, " 0.25 ");
  s = s.replace(/\bतीन\s+चौथाई\b/gi, " 0.75 ");

  return s.trim();
}

function cleanItemName(name) {
  if (!name) return "";
  let words = name.split(/\s+/);
  let filtered = words.filter(w => !isStopWordOrUnitOrNum(w));
  return filtered.join(' ').trim();
}

// Parse single item segment
function parseSegment(segment) {
  let items = [];
  let cleanSeg = segment.replace(/\b(?:रुपये|रुपया|रु|rs|rupees|rupee)\b/gi, ' ');

  // Regex to extract Quantity, Potential Unit, Item Name, and Rate/Price
  const itemRegex = /(\d+(?:\.\d+)?)\s*([a-zA-Bh-zA-Z\u0900-\u097F]*)\s+([\u0900-\u097F\w\s]+?)\s+(\d+(?:\.\d+)?)(?=\s*(?:\d+(?:\.\d+)?\s|[a-zA-Bh-zA-Z\u0900-\u097F]+|\s*$))/gi;

  let match;
  let matches = [];

  while ((match = itemRegex.exec(cleanSeg)) !== null) {
    matches.push(match);
  }

  if (matches.length > 0) {
    for (let m of matches) {
      let qty = parseFloat(m[1]);
      let potentialUnit = cleanWord(m[2]);
      let rawItemName = m[3].trim();
      let price = parseFloat(m[4]);

      let unit = "पीस";
      let itemName = rawItemName;

      if (potentialUnit && UNIT_MAP[potentialUnit]) {
        unit = UNIT_MAP[potentialUnit];
      } else {
        let firstWord = cleanWord(rawItemName.split(/\s+/)[0]);
        if (UNIT_MAP[firstWord]) {
          unit = UNIT_MAP[firstWord];
          itemName = rawItemName.split(/\s+/).slice(1).join(' ');
        } else if (potentialUnit) {
          itemName = potentialUnit + " " + rawItemName;
          if (qty % 1 !== 0) unit = "किलो";
        } else if (qty % 1 !== 0) {
          unit = "किलो";
        }
      }

      itemName = cleanItemName(itemName);

      if (itemName && !isNaN(qty) && !isNaN(price)) {
        let rate = price;
        let total = Math.round((qty * rate) * 100) / 100;

        items.push({
          item_name: itemName,
          quantity: qty,
          unit: unit,
          rate: rate,
          total: total
        });
      }
    }
  }

  // Fallback scanner for segments where regex didn't match directly
  if (items.length === 0) {
    let numbers = cleanSeg.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 2) {
      let qty = parseFloat(numbers[0]);
      let price = parseFloat(numbers[numbers.length - 1]);

      let firstNumIdx = cleanSeg.indexOf(numbers[0]);
      let lastNumIdx = cleanSeg.lastIndexOf(numbers[numbers.length - 1]);

      let middleText = cleanSeg.substring(firstNumIdx + numbers[0].length, lastNumIdx).trim();

      let words = middleText.split(/\s+/);
      let unit = "पीस";
      let itemWords = [];

      for (let w of words) {
        let lower = cleanWord(w);
        if (UNIT_MAP[lower]) {
          unit = UNIT_MAP[lower];
        } else {
          itemWords.push(w);
        }
      }

      if (qty % 1 !== 0 && unit === "पीस") {
        unit = "किलो";
      }

      let itemName = cleanItemName(itemWords.join(' '));

      if (itemName && !isNaN(qty) && !isNaN(price)) {
        let rate = price;
        let total = Math.round((qty * rate) * 100) / 100;

        items.push({
          item_name: itemName,
          quantity: qty,
          unit: unit,
          rate: rate,
          total: total
        });
      }
    }
  }

  return items;
}

// Main Voice Parsing Logic
function parseVoiceToTable(text) {
  if (!text || typeof text !== 'string') {
    return { customer_name: "नकद ग्राहक", items: [], grand_total: 0 };
  }

  let rawText = text.trim();
  let customerName = "नकद ग्राहक";

  // Patterns for Customer Name
  const custPattern1 = /(?:ग्राहक|customer)\s+([a-zA-Bh-zA-Z\u0900-\u097F]+)/i;
  const custPattern2 = /([a-zA-Bh-zA-Z\u0900-\u097F]+)\s+(?:के नाम|के लिए|का बिल|का)/i;

  let matchCust = rawText.match(custPattern1);
  if (matchCust && matchCust[1]) {
    let candidate = matchCust[1].trim();
    if (!isStopWordOrUnitOrNum(candidate)) {
      customerName = candidate;
      rawText = rawText.replace(matchCust[0], ' ');
    }
  } else {
    matchCust = rawText.match(custPattern2);
    if (matchCust && matchCust[1]) {
      let candidate = matchCust[1].trim();
      if (!isStopWordOrUnitOrNum(candidate)) {
        customerName = candidate;
        rawText = rawText.replace(matchCust[0], ' ');
      }
    }
  }

  // Preprocess Hindi quantity words
  let processedText = preprocessHindiQuantities(rawText);

  // Split on natural connectors
  let segments = processedText.split(/\b(?:और|फिर|अगला|तथा|एवं|and)\b|,|;|[\n\r]+/gi);

  let items = [];

  for (let seg of segments) {
    seg = seg.trim();
    if (!seg) continue;

    let parsedFromSeg = parseSegment(seg);
    if (parsedFromSeg && parsedFromSeg.length > 0) {
      items.push(...parsedFromSeg);
    }
  }

  let grandTotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  grandTotal = Math.round(grandTotal * 100) / 100;

  return {
    customer_name: customerName,
    items: items,
    grand_total: grandTotal
  };
}

// API Endpoint
app.post('/api/test-billing', (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: "कोई आवाज़ रिकॉर्ड नहीं हुई" });
    }

    let parsedData = parseVoiceToTable(text);

    res.json({
      success: true,
      rawText: text,
      data: parsedData
    });

  } catch (error) {
    console.error("Parser Server Error:", error.message);
    res.status(500).json({
      success: false,
      error: "प्रोसेसिंग में समस्या आई",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Smart Kirana Voice Billing Server running on port ${PORT}`));
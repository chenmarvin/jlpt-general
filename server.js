const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const HISTORY_FILE = path.join(__dirname, 'parse_history.json');

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

app.post('/api/parse', async (req, res) => {
  const { sentence } = req.body;
  if (!sentence || !sentence.trim()) {
    return res.status(400).json({ error: '請輸入日文句子' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `你是日語語法分析助手。請將以下日文句子拆解成有意義的語法單位，並提供繁體中文翻譯。

日文句子：${sentence.trim()}

請以JSON格式回覆，格式如下：
{
  "original": "原始句子",
  "translation": "整句繁體中文翻譯",
  "chunks": [
    {
      "text": "文字",
      "reading": "讀音（平假名）",
      "meaning": "繁體中文意思",
      "type": "詞性代碼",
      "highlighted": true
    }
  ]
}

拆解規則：
- 將有實際語義的詞彙/片語設為 highlighted: true（名詞、動詞、形容詞、副詞、代名詞、接頭詞等內容詞）
- 助詞、助動詞、句末語氣詞等語法功能詞設為 highlighted: false
- type 使用以下之一：noun、verb、adjective、adverb、pronoun、particle、aux_verb、conjunction、noun_phrase、verb_phrase、adj_phrase、interjection
- 將語義相關的詞組合在一起（如「食べたい」合為一個動詞片語、「高いのは」作為一個形容詞片語）
- 句末的禮貌語氣（です、ます、か、ね、よ等）通常設為 highlighted: false
- 複合助詞（については、に対して等）作為一個 particle 單位
- 慣用語或固定搭配作為一個單位

只回覆純 JSON，不要有其他文字或 markdown 代碼塊。`
      }]
    });

    const jsonText = message.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonText);

    const history = loadHistory();
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      original: parsed.original || sentence.trim(),
      translation: parsed.translation,
      chunks: parsed.chunks,
    };
    history.unshift(entry);
    saveHistory(history);

    res.json({ ...parsed, id: entry.id, timestamp: entry.timestamp });
  } catch (err) {
    console.error('Parse error:', err);
    if (err instanceof SyntaxError) {
      res.status(500).json({ error: 'AI 回覆格式錯誤，請再試一次' });
    } else {
      res.status(500).json({ error: err.message || '解析失敗，請再試一次' });
    }
  }
});

app.get('/api/history', (req, res) => {
  res.json(loadHistory());
});

app.delete('/api/history/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const history = loadHistory().filter(e => e.id !== id);
  saveHistory(history);
  res.json({ ok: true });
});

app.delete('/api/history', (req, res) => {
  saveHistory([]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Parser: http://localhost:${PORT}/parser.html`);
});

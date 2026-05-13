// Ko-Pilot Backend — Brief Generator
// POST /api/generate-brief
// Body: { company, person, title?, notes? }
// Returns: { brief, generated_at, model }

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { company, person, title = '', notes = '' } = req.body || {};

    if (!company || !person) {
      return res.status(400).json({ error: 'company ve person zorunlu' });
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!tavilyKey || !anthropicKey) {
      return res.status(500).json({
        error: 'API anahtarları yok',
        detail: 'TAVILY_API_KEY ve ANTHROPIC_API_KEY env vars Vercel projeden eksik'
      });
    }

    // === 1. Tavily searches (paralel) — 3 query (60s timeout için optimize) ===
    const searches = [
      `${company} son haberler strateji 2026`,
      `${company} CEO yönetim değişim M&A`,
      `${person} ${company} LinkedIn`,
    ];

    const searchResults = await Promise.all(
      searches.map(query =>
        fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query,
            max_results: 3,
            include_answer: false,
            search_depth: 'basic'
          })
        }).then(r => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] }))
      )
    );

    // === 2. Bulguları derle ===
    const context = searches.map((q, i) => {
      const data = searchResults[i];
      const items = (data.results || []).slice(0, 3).map(r =>
        `- [${r.title || 'kaynak'}](${r.url || ''})\n  ${(r.content || '').slice(0, 400)}`
      ).join('\n');
      return `### Arama: "${q}"\n${items || '(sonuç yok)'}`;
    }).join('\n\n');

    // === 3. Anthropic Claude — brief üret ===
    const systemPrompt = `Sen Ateş Sungur'un AI assistant'ısın. Ateş Türkiye'de C-suite execution consultant. Senior partner-level brief üretiyorsun.

REFERANS NOKTALAR:
- "Liderin Uygulama Gücü" kitabının yazarı
- Otokoç İkinci El vakası: 196 aksiyon → 55 başlık, 4 ayda tamamlandı
- Robert S. Kaplan (HBS, Balanced Scorecard mucidi) testimonial veriyor — kurumsal cred
- Execution Partners kurucu ortağı, 28 yıl deneyim, 6 ülke 150+ proje

TON: Sade, profesyonel, Türkçe. Yapay zekaya özgü clichelerden kaç ("ek olarak", "ayrıca belirtmek gerekir ki" vb.). Sayılarla konuş.

KURAL: Bilmediğin şeyi UYDURMA. "⚠ doğrulanmalı" veya "halka açık veri sınırlı" işareti koy.`;

    const userPrompt = `## HEDEF
Şirket: ${company}
Kişi: ${person}${title ? ' · ' + title : ''}
${notes ? '\nMevcut not: ' + notes : ''}

## ARAŞTIRMA BULGULARI
${context}

## GÖREV
Yukarıdaki bulgulara dayanarak, Ateş'in bu prospect ile görüşme öncesi okuyacağı **7-bölümlü brief** üret. Markdown formatında.

### 1. Açılış Pasajı
2 cümlelik hook. Stratejik moment + Otokoç vaka referansı + 15 dk görüşme önerisi. WhatsApp/email'e kopyalanabilir kalite.

### 2. Stratejik Moment Sinyalleri
Son 18 ayın execution-gap penceresi açan sinyalleri. 3-5 madde. Her madde için kaynak (URL).

### 3. Execution-Gap Hipotezi
Bu şirket için spesifik hipotez (sektörel heuristic + şirkete özel veri). 2-3 cümle. Otokoç'a benzer iyileştirme potansiyeli vurgusu.

### 4. Warm-Intro Haritası
Bilinen kontakt varsa öncelik. Yoksa ikincil yollar (Kaplan referansı, sektörel ortaklık, vb.). Önerilen ilk hamle.

### 5. Kişi Profili — ${person}
Görev süresi, önceki roller, public görüşler/röportajlar, diyalog tarzı tahmini. Önerilen yaklaşım. ⚠ ile belirsiz bilgileri işaretle.

### 6. Karar Verici Haritası
Sponsor / karar verici / bütçe sahibi / influencer matrix'i. Yaklaşım stratejisi.

### 7. Uygunluk Skoru
**X/10** + kırılım: yapısal karmaşıklık, ciro bandı, profesyonel yönetim, strategic window, personal fit. Risk + mitigasyon notu.

ÇIKTI: Sadece markdown brief, başka açıklama yok.`;

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      return res.status(500).json({
        error: 'Anthropic API hatası',
        status: anthropicResp.status,
        detail: errText.slice(0, 500)
      });
    }

    const anthropicData = await anthropicResp.json();
    const briefMarkdown = anthropicData.content?.[0]?.text || '';

    if (!briefMarkdown) {
      return res.status(500).json({ error: 'Boş brief geldi', raw: anthropicData });
    }

    return res.status(200).json({
      brief: briefMarkdown,
      generated_at: new Date().toISOString(),
      model: 'claude-haiku-4-5',
      searches_count: searches.length,
      tokens: {
        input: anthropicData.usage?.input_tokens || 0,
        output: anthropicData.usage?.output_tokens || 0,
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server hatası', detail: e.message });
  }
}

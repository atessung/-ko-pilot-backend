# Ko-Pilot Backend

Phase 1.5 brief generator. Vercel function. Anthropic Claude + Tavily web search.

## Endpoint

```
POST /api/generate-brief
Body: { company, person, title?, notes? }
Returns: { brief (markdown), generated_at, model, searches_count, tokens }
```

## Environment variables (Vercel'de ayarlanır)

- `ANTHROPIC_API_KEY` — Claude API key
- `TAVILY_API_KEY` — Tavily search API key

## Maliyet

- Per brief: ~$0.03-0.08 (Claude Sonnet 4.6 + 5 Tavily search)
- Aylık ~50 brief: ~$2-5
- Tavily ücretsiz tier 1000 arama/ay yeterli (~200 brief)

## Local test

Bu function Vercel serverless olarak çalışır. Local'de test için Vercel CLI gerek:

```bash
npm install -g vercel
vercel dev
```

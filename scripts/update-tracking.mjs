#!/usr/bin/env node
/**
 * update-tracking.mjs
 * Refreshes data/tracking.json with new "novedades" about the abundance funding
 * world in Europe, using the Anthropic API + server-side web search.
 *
 * Runs daily via .github/workflows/update-tracking.yml (needs ANTHROPIC_API_KEY).
 * New items are merged into the existing feed and de-duplicated by URL.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data", "tracking.json");
const MODEL = "claude-opus-4-8";
const MAX_ITEMS = 80; // keep the feed bounded

const CATEGORIES = [
  "money-flow", "ai-governance", "animal-welfare",
  "abundance-progress", "biosecurity", "org-network", "critique"
];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function loadFeed() {
  try {
    return JSON.parse(readFileSync(DATA, "utf8"));
  } catch {
    return { generated: isoToday(), note: "", items: [] };
  }
}

function extractJsonArray(text) {
  // Prefer a fenced ```json block; fall back to the first top-level [ ... ].
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "").toLowerCase();
}

function valid(item) {
  return item && typeof item.title === "string" && typeof item.url === "string" &&
    /^https?:\/\//.test(item.url) && typeof item.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) && CATEGORIES.includes(item.category);
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("No ANTHROPIC_API_KEY set — skipping tracking refresh.");
    return;
  }
  const client = new Anthropic({ apiKey: key });
  const feed = loadFeed();
  const known = new Set(feed.items.map((i) => normalizeUrl(i.url)));
  const recentTitles = feed.items.slice(0, 25).map((i) => `- ${i.date} · ${i.title}`).join("\n");

  const prompt = `You are the research tracker for a microsite that maps the "abundance funding world" with a EUROPE focus — the network around Coefficient Giving (formerly Open Philanthropy), Good Ventures (Dustin Moskovitz / Cari Tuna), and the Collison/Stripe ecosystem (Progress Studies, Arc Institute, Institute for Progress), and how their money and agenda enter Europe (EU AI governance, farm-animal welfare, the "abundance"/YIMBY/progress movement, biosecurity / the EU Biotech Act).

Today is ${isoToday()}. Use web search to find genuinely NEW, REAL, CITED developments from roughly the last 60 days, weighted heavily toward the EUROPE angle. Search across these threads: Coefficient Giving grants/funds/donors; EU AI governance (BlueDot Impact, CLTR, Talos Network, The Future Society, SaferAI, Pour Demain, EU AI Office, EU AI Act); farm-animal welfare in the EU (Eurogroup for Animals, Compassion in World Farming, Animal Equality, Equalia, Albert Schweitzer Foundation, L214); the Collison/Stripe/Progress Ireland/Works in Progress/ARIA/Arc Institute world; the abundance movement in Europe/UK (YIMBY, Britain Remade, planning reform) and its critiques; the EU Biotech Act and biosecurity policy.

Do NOT repeat items already in the feed. Here are the most recent existing entries (avoid duplicates and near-duplicates):
${recentTitles || "(none yet)"}

Return ONLY a JSON array (in a \`\`\`json code block) of new items, most recent first, at most 12. Each item must have EXACTLY these fields:
{
  "date": "YYYY-MM-DD",
  "title": "headline <=100 chars",
  "summary": "2-3 factual sentences, Europe angle emphasized",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "region": e.g. "EU" | "UK" | "Ireland" | "Spain" | "Germany" | "France" | "Belgium" | "Switzerland" | "Global" | "US",
  "org": "primary organization",
  "url": "canonical source URL",
  "source": "publication name"
}
Only include items you actually verified via a real URL from web search. If nothing new is found, return an empty array [].`;

  const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }];
  let messages = [{ role: "user", content: prompt }];
  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium" },
    tools,
    messages,
  });

  // Server-side tool loop may pause (pause_turn); resume until it finishes.
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard++ < 6) {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      tools,
      messages,
    });
  }

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const found = extractJsonArray(text).filter(valid);

  const fresh = found.filter((i) => !known.has(normalizeUrl(i.url)));
  console.log(`Model returned ${found.length} valid items; ${fresh.length} are new.`);

  if (!fresh.length) {
    // Still bump the generated date so the site shows a recent check.
    feed.generated = isoToday();
    writeFileSync(DATA, JSON.stringify(feed, null, 2) + "\n");
    console.log("No new items; refreshed timestamp only.");
    return;
  }

  const merged = [...fresh, ...feed.items]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, MAX_ITEMS);

  feed.items = merged;
  feed.generated = isoToday();
  writeFileSync(DATA, JSON.stringify(feed, null, 2) + "\n");
  console.log(`Wrote ${merged.length} items to tracking.json.`);
}

main().catch((e) => {
  console.error("update-tracking failed:", e?.message || e);
  process.exit(1);
});

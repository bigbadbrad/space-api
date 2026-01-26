// /agents/funFactsAgent.js
require('dotenv').config();
const axios = require('axios');
const OpenAI = require('openai');
const { createAgentContent } = require('./agentService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ HARDCODED API NINJAS KEY EXACTLY LIKE CURL
const NINJAS_API_KEY = "Cet7i+XlQCkcdaF4RC7xMQ==BQBd4rRDMozY2u5Q";

// ✅ Fun Fact API sources
const FACT_APIS = [
  { 
    name: "API Ninjas", 
    url: "https://api.api-ninjas.com/v1/facts", 
    headers: { "X-Api-Key": NINJAS_API_KEY },
    process: (data) => Array.isArray(data) && data.length > 0 ? data[0].fact || data[0] : null
  },
  { 
    name: "Numbers API", 
    url: "http://numbersapi.com/random/trivia", 
    headers: {}, 
    process: (data) => typeof data === "string" ? data : null
  },
  { 
    name: "Useless Facts API", 
    url: "https://uselessfacts.jsph.pl/random.json?language=en", 
    headers: {}, 
    process: (data) => data.text || null
  }
];

// ✅ Function to fetch a fun fact from available APIs
async function fetchFunFact() {
  for (const api of FACT_APIS) {
    try {
      console.log(`[FunFactAgent] Fetching from ${api.name}...`);
      const response = await axios.get(api.url, { headers: api.headers });

      const fact = api.process(response.data);

      if (fact && fact.length > 10) {
        console.log(`[FunFactAgent] Retrieved Fun Fact: ${fact}`);
        return fact;
      } else {
        console.warn(`[FunFactAgent] No valid fact from ${api.name}.`);
      }
    } catch (error) {
      console.warn(`[FunFactAgent] API failed: ${api.name}, trying next...`, error.message);
    }
  }

  console.error("[FunFactAgent] All APIs failed, no fun fact available.");
  return null;
}

// ✅ Function to generate AI commentary on the fun fact
async function generateCommentary(factText) {
  try {
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a trivia expert providing additional insights on fun facts." },
        { role: "user", content: `Provide a short and engaging trivia explanation related to this fun fact: "${factText}". Keep it under 2 sentences.` }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const commentary = gptResponse.choices[0]?.message.content.trim() || "No additional trivia available.";
    console.log("[FunFactAgent] Generated commentary:", commentary);
    return commentary;

  } catch (error) {
    console.warn("[FunFactAgent] Failed to generate commentary:", error.message);
    return "No additional trivia available.";
  }
}

// ✅ Function to create and publish the fun fact post
async function createFunFactPost() {
  try {
    console.log("[FunFactAgent] Starting Daily Fun Fact post creation...");

    const factText = await fetchFunFact();
    if (!factText) return;

    const commentary = await generateCommentary(factText);

    await createAgentContent({
      handle: "funfacts",
      groupName: "public-group",
      contentType: "post",
      contentData: {
        name: "Today's Fun Fact",
        description: `${factText}\n\nDid you know?\n\n${commentary}`,
        imageUrl: "https://grouptext.co/agents/fun-facts.png",
      },
    });

    console.log("[FunFactAgent] Daily Fun Fact post successfully created!");
  } catch (error) {
    console.error("[FunFactAgent] Error creating Fun Fact post:", error);
  }
}

module.exports = {
  createFunFactPost,
};

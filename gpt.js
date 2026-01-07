import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function askGPT(prompt) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",   // fast & cheap
    messages: [
      { role: "system", content: `You are a helpful customer support agent. Analyze if this chat between customer and support indicates that customer's problem has been solved or not.
        
    STRICT RULES:
    - reply only yes or no
    - no explanation requried` },
      { role: "user", content: prompt }
    ],
    temperature: 0.4
  });

  return response.choices[0].message.content;
}

// import { askGPT } from "./gpt.js";

// const reply = await askGPT("Customer is angry about late response. Reply politely.");
// console.log(reply);

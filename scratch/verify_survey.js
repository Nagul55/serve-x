import { invokeLlm } from '../backend/src/services/llmService.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function simulateConversation() {
  console.log('🚀 Simulating Survey Conversation with DeepSeek V4 Flash...\n');

  const systemPrompt = `You are the ServeX Survey Assistant — a warm, efficient WhatsApp chatbot that helps Field Officers report community needs.

YOUR GOAL: Collect these pieces of information:
1. village_name
2. need_type (water, food, health, etc)
3. household_count

RULES:
- Ask for ONE missing field at a time.
- Be brief (2 sentences max).`;

  let history = [{ role: 'system', content: systemPrompt }];
  let userMessages = [
    'I want to report a new need.',
    'It is in the village of Kuppam.',
    'They need clean drinking water.',
    'About 45 families are affected.'
  ];

  for (const msg of userMessages) {
    console.log('👤 User:', msg);
    history.push({ role: 'user', content: msg });
    
    try {
      const res = await invokeLlm(history);
      const aiMsg = res.content;
      console.log('🤖 AI:', aiMsg);
      history.push({ role: 'assistant', content: aiMsg });
      console.log('---');
    } catch (err) {
      console.error('❌ Error:', err.message);
      break;
    }
  }

  console.log('\n✅ Simulation finished.');
}

simulateConversation();

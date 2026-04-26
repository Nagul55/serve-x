/**
 * Quick test script for NVIDIA DeepSeek V4 Flash API integration.
 * Usage: node backend/src/scripts/test-deepseek.js
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import OpenAI from 'openai';

const apiKey = process.env.NVIDIA_API_KEY;
const baseURL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const model = process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash';

if (!apiKey) {
  console.error('❌ NVIDIA_API_KEY not found in .env');
  process.exit(1);
}

console.log('🔧 Config:');
console.log(`   API Key: ${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`);
console.log(`   Base URL: ${baseURL}`);
console.log(`   Model: ${model}`);
console.log('');

const client = new OpenAI({ apiKey, baseURL });

async function testBasicCompletion() {
  console.log('─── Test 1: Basic Chat Completion ───');
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
        { role: 'user', content: 'Say "DeepSeek V4 Flash is working!" in one line.' },
      ],
      temperature: 0.3,
      max_tokens: 100,
      stream: false,
    });

    const text = completion.choices?.[0]?.message?.content || '';
    console.log('✅ Response:', text);
    console.log(`   Tokens used: ${completion.usage?.total_tokens || 'N/A'}`);
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

async function testJsonExtraction() {
  console.log('\n─── Test 2: JSON Data Extraction ───');
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You MUST respond with ONLY valid JSON. No markdown, no explanations.' },
        {
          role: 'user',
          content: `Extract data from this text: "There are 50 households in Kuppam village affected by water shortage for 10 days. Children and elderly are most affected."
Return JSON with: village_name, household_count, days_of_issue, need_type, vulnerable_groups`,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
      stream: false,
    });

    const text = completion.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('✅ Parsed JSON:', JSON.stringify(parsed, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

async function testSurveyConversation() {
  console.log('\n─── Test 3: Survey Conversation Simulation ───');
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `You are the ServeX Survey Assistant for WhatsApp. Help field officers report community needs. Be warm, empathetic, and brief (2-3 sentences). Ask for ONE piece of information at a time.`,
        },
        {
          role: 'user',
          content: 'We have a water problem in our village.',
        },
      ],
      temperature: 0.4,
      max_tokens: 200,
      stream: false,
    });

    const text = completion.choices?.[0]?.message?.content || '';
    console.log('✅ AI Survey Response:', text);
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

async function testStreamCompletion() {
  console.log('\n─── Test 4: Streaming Completion ───');
  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: 'Count from 1 to 5 with emoji.' },
      ],
      temperature: 0.5,
      max_tokens: 100,
      stream: true,
    });

    process.stdout.write('✅ Streamed: ');
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content || '';
      process.stdout.write(text);
    }
    console.log('\n');
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

// Run all tests
console.log('🚀 Testing NVIDIA DeepSeek V4 Flash API...\n');

const results = [];
results.push(await testBasicCompletion());
results.push(await testJsonExtraction());
results.push(await testSurveyConversation());
results.push(await testStreamCompletion());

const passed = results.filter(Boolean).length;
const total = results.length;

console.log('═══════════════════════════════════');
console.log(`Results: ${passed}/${total} tests passed`);
if (passed === total) {
  console.log('🎉 All tests PASSED! DeepSeek V4 Flash is fully integrated.');
} else {
  console.log(`⚠️  ${total - passed} test(s) failed. Check the output above.`);
}

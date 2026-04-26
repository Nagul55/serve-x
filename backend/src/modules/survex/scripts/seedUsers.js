import mongoose from 'mongoose';
import { env } from '../../../config/env.js';
import { connectToDatabase } from '../../../config/database.js';
import { SurvexUser, hashSurvexPassword } from '../models/survexUser.model.js';
import { normalizeWhatsAppPhone } from '../utils/sanitize.js';

function parseFieldOfficers() {
  const raw = process.env.SURVEX_SEED_FIELD_OFFICERS_JSON || '[]';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function upsertCoordinator() {
  const name = process.env.SURVEX_SEED_COORDINATOR_NAME;
  const phone = normalizeWhatsAppPhone(process.env.SURVEX_SEED_COORDINATOR_PHONE);
  const password = process.env.SURVEX_SEED_COORDINATOR_PASSWORD;

  if (!name || !phone || !password) {
    throw new Error('Set SURVEX_SEED_COORDINATOR_NAME, SURVEX_SEED_COORDINATOR_PHONE and SURVEX_SEED_COORDINATOR_PASSWORD.');
  }

  const passwordHash = await hashSurvexPassword(password);

  let coordinator = await SurvexUser.findOne({ phone });
  if (!coordinator) {
    coordinator = await SurvexUser.create({
      name,
      phone,
      role: 'coordinator',
      password_hash: passwordHash,
      is_active: true,
    });
  } else {
    coordinator.name = name;
    coordinator.role = 'coordinator';
    coordinator.password_hash = passwordHash;
    coordinator.is_active = true;
    await coordinator.save();
  }

  return coordinator;
}

async function upsertFieldOfficers(coordinatorId) {
  const officers = parseFieldOfficers();
  for (const officer of officers) {
    const name = String(officer?.name || '').trim();
    const phone = normalizeWhatsAppPhone(officer?.phone);
    const password = String(officer?.password || '');

    if (!name || !phone || password.length < 8) {
      // Skip invalid seed rows.
      continue;
    }

    const passwordHash = await hashSurvexPassword(password);

    let user = await SurvexUser.findOne({ phone });
    if (!user) {
      user = await SurvexUser.create({
        name,
        phone,
        role: 'field_officer',
        assignedCoordinatorId: coordinatorId,
        password_hash: passwordHash,
        is_active: true,
      });
    } else {
      user.name = name;
      user.role = 'field_officer';
      user.assignedCoordinatorId = coordinatorId;
      user.password_hash = passwordHash;
      user.is_active = true;
      await user.save();
    }
  }
}

async function run() {
  await connectToDatabase(env.mongoUri);

  const coordinator = await upsertCoordinator();
  await upsertFieldOfficers(coordinator.id);

  console.log('Survex users seeded successfully.');
  console.log(`Coordinator: ${coordinator.name} (${coordinator.phone})`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Failed to seed Survex users:', error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

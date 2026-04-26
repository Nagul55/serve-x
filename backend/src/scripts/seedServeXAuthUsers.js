import mongoose from 'mongoose';
import { connectToDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function upsertUser({ email, name, role, assignedCoordinatorId = null }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error(`Invalid user seed input for role=${role}`);
  }
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    user = await User.create({
      email: normalizedEmail,
      name: name || '',
      role,
      password_hash: '',
      assigned_coordinator_id: assignedCoordinatorId,
      is_active: true,
    });
  } else {
    user.name = name || user.name || '';
    user.role = role;
    user.password_hash = '';
    user.assigned_coordinator_id = assignedCoordinatorId;
    user.is_active = true;
    await user.save();
  }

  return user;
}

async function run() {
  await connectToDatabase(env.mongoUri);

  const coordinatorEmail = normalizeEmail(
    process.env.SERVEX_SEED_COORDINATOR_EMAIL || 'coordinator@servex.org'
  );
  const coordinatorName = String(process.env.SERVEX_SEED_COORDINATOR_NAME || 'ServeX Coordinator');

  const fieldOfficerEmail = normalizeEmail(
    process.env.SERVEX_SEED_FIELD_OFFICER_EMAIL || 'officer@servex.org'
  );
  const fieldOfficerName = String(process.env.SERVEX_SEED_FIELD_OFFICER_NAME || 'ServeX Field Officer');

  const coordinator = await upsertUser({
    email: coordinatorEmail,
    name: coordinatorName,
    role: 'coordinator',
  });

  await upsertUser({
    email: fieldOfficerEmail,
    name: fieldOfficerName,
    role: 'field_officer',
    assignedCoordinatorId: coordinator._id,
  });

  console.log('ServeX auth users seeded.');
  console.log(`Coordinator: ${coordinatorEmail}`);
  console.log(`Field officer: ${fieldOfficerEmail}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Failed to seed ServeX auth users:', error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

import mongoose from 'mongoose';
import { connectToDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { resetAndSeedServeXFreshStart } from '../services/freshStart.service.js';

async function run() {
  await connectToDatabase(env.mongoUri);

  const result = await resetAndSeedServeXFreshStart();

  console.log('ServeX reset complete. Seeded identities:');
  console.log(`Coordinator: ${result.identities.coordinator.name} <${result.identities.coordinator.email}>`);
  console.log(`Field Officer: ${result.identities.fieldOfficer.name} <${result.identities.fieldOfficer.email}>`);
  console.log(`Volunteer: ${result.identities.volunteer.name} <${result.identities.volunteer.email}>`);

  if (result.warnings.length > 0) {
    console.warn('Warnings:');
    for (const warning of result.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (error) => {
  console.error('Failed to reset ServeX fresh start:', error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});

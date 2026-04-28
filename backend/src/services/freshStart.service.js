import { CommunityNeed } from '../models/communityNeed.model.js';
import { Dispatch } from '../models/dispatch.model.js';
import { FieldReport } from '../models/fieldReport.model.js';
import { Session } from '../models/session.model.js';
import { User, hashUserPassword } from '../models/user.model.js';
import { Volunteer } from '../models/volunteer.model.js';
import { normalizeEmail, isValidEmail } from '../utils/auth.js';
import { SurvexConversation } from '../modules/survex/models/survexConversation.model.js';
import { SurvexSurvey } from '../modules/survex/models/survexSurvey.model.js';
import { SurvexUser, hashSurvexPassword } from '../modules/survex/models/survexUser.model.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../modules/survex/utils/sanitize.js';

const DEFAULT_IDENTITIES = {
  coordinator: {
    name: 'ServeX Coordinator',
    email: 'coordinator@gmail.com',
  },
  fieldOfficer: {
    name: 'ServeX Field Officer',
    email: 'fieldofficer@gmail.com',
  },
  volunteer: {
    name: 'Arun',
    email: 'arunnagul2025@gmail.com',
  },
};

const DEFAULT_MAIN_LOGIN_PASSWORDS = {
  coordinator: 'coordinator@123',
  fieldOfficer: 'fieldofficer@gmail.com',
};

function parseFirstSurvexSeedOfficerPhone() {
  const raw = String(process.env.SURVEX_SEED_FIELD_OFFICERS_JSON || '[]').trim();
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return '';
    return normalizeWhatsAppPhone(parsed[0]?.phone);
  } catch {
    return '';
  }
}

function normalizeIdentityName(value, fallback) {
  return sanitizeText(value, 80) || fallback;
}

function normalizeIdentityEmail(value, fallback) {
  const normalized = normalizeEmail(value || fallback);
  if (!isValidEmail(normalized)) {
    throw new Error(`Invalid email provided for fresh start seed: ${value || fallback}`);
  }
  return normalized;
}

function resolveConfig(overrides = {}) {
  const coordinatorName = normalizeIdentityName(
    overrides.coordinatorName || process.env.SERVEX_RESET_COORDINATOR_NAME,
    DEFAULT_IDENTITIES.coordinator.name
  );
  const coordinatorEmail = normalizeIdentityEmail(
    overrides.coordinatorEmail || process.env.SERVEX_RESET_COORDINATOR_EMAIL,
    DEFAULT_IDENTITIES.coordinator.email
  );

  const fieldOfficerName = normalizeIdentityName(
    overrides.fieldOfficerName || process.env.SERVEX_RESET_FIELD_OFFICER_NAME,
    DEFAULT_IDENTITIES.fieldOfficer.name
  );
  const fieldOfficerEmail = normalizeIdentityEmail(
    overrides.fieldOfficerEmail || process.env.SERVEX_RESET_FIELD_OFFICER_EMAIL,
    DEFAULT_IDENTITIES.fieldOfficer.email
  );

  const volunteerName = normalizeIdentityName(
    overrides.volunteerName || process.env.SERVEX_RESET_VOLUNTEER_NAME,
    DEFAULT_IDENTITIES.volunteer.name
  );
  const volunteerEmail = normalizeIdentityEmail(
    overrides.volunteerEmail || process.env.SERVEX_RESET_VOLUNTEER_EMAIL,
    DEFAULT_IDENTITIES.volunteer.email
  );

  const coordinatorPhone = normalizeWhatsAppPhone(
    overrides.coordinatorPhone ||
      process.env.SERVEX_RESET_COORDINATOR_PHONE ||
      process.env.SURVEX_SEED_COORDINATOR_PHONE
  );

  const fieldOfficerPhone = normalizeWhatsAppPhone(
    overrides.fieldOfficerPhone ||
      process.env.SERVEX_RESET_FIELD_OFFICER_PHONE ||
      parseFirstSurvexSeedOfficerPhone()
  );

  const volunteerPhone = normalizeWhatsAppPhone(
    overrides.volunteerPhone || process.env.SERVEX_RESET_VOLUNTEER_PHONE
  );

  const survexPassword = String(
    overrides.survexPassword || process.env.SERVEX_RESET_SURVEX_PASSWORD || 'ServeX@12345'
  );
  const mainCoordinatorPassword = String(
    overrides.mainCoordinatorPassword
    || process.env.SERVEX_RESET_COORDINATOR_PASSWORD
    || DEFAULT_MAIN_LOGIN_PASSWORDS.coordinator
  ).trim();
  const mainFieldOfficerPassword = String(
    overrides.mainFieldOfficerPassword
    || process.env.SERVEX_RESET_FIELD_OFFICER_PASSWORD
    || DEFAULT_MAIN_LOGIN_PASSWORDS.fieldOfficer
  ).trim();

  return {
    coordinatorName,
    coordinatorEmail,
    coordinatorPhone,
    fieldOfficerName,
    fieldOfficerEmail,
    fieldOfficerPhone,
    volunteerName,
    volunteerEmail,
    volunteerPhone,
    survexPassword,
    mainCoordinatorPassword,
    mainFieldOfficerPassword,
  };
}

async function purgeData() {
  await Promise.all([
    Session.deleteMany({}),
    User.deleteMany({}),
    CommunityNeed.deleteMany({}),
    Volunteer.deleteMany({}),
    Dispatch.deleteMany({}),
    FieldReport.deleteMany({}),
    SurvexConversation.deleteMany({}),
    SurvexSurvey.deleteMany({}),
    SurvexUser.deleteMany({}),
  ]);
}

async function seedMainServeXUsers(config) {
  const coordinatorPasswordHash = await hashUserPassword(config.mainCoordinatorPassword);
  const fieldOfficerPasswordHash = await hashUserPassword(config.mainFieldOfficerPassword);

  let coordinator = await User.findOne({ email: config.coordinatorEmail });
  if (!coordinator) {
    coordinator = await User.create({
      name: config.coordinatorName,
      email: config.coordinatorEmail,
      role: 'coordinator',
      password_hash: coordinatorPasswordHash,
      is_active: true,
    });
  } else {
    coordinator.name = config.coordinatorName;
    coordinator.role = 'coordinator';
    coordinator.password_hash = coordinatorPasswordHash;
    coordinator.is_active = true;
    await coordinator.save();
  }

  let fieldOfficer = await User.findOne({ email: config.fieldOfficerEmail });
  if (!fieldOfficer) {
    fieldOfficer = await User.create({
      name: config.fieldOfficerName,
      email: config.fieldOfficerEmail,
      role: 'field_officer',
      assigned_coordinator_id: coordinator._id,
      password_hash: fieldOfficerPasswordHash,
      is_active: true,
    });
  } else {
    fieldOfficer.name = config.fieldOfficerName;
    fieldOfficer.role = 'field_officer';
    fieldOfficer.assigned_coordinator_id = coordinator._id;
    fieldOfficer.password_hash = fieldOfficerPasswordHash;
    fieldOfficer.is_active = true;
    await fieldOfficer.save();
  }

  let volunteer = await Volunteer.findOne({ email: config.volunteerEmail });
  if (!volunteer) {
    volunteer = await Volunteer.create({
      full_name: config.volunteerName,
      email: config.volunteerEmail,
      phone: config.volunteerPhone,
      status: 'active',
      assigned_coordinator_id: coordinator._id,
      total_missions: 0,
      skills: [],
      languages: [],
    });
  } else {
    volunteer.full_name = config.volunteerName;
    volunteer.phone = config.volunteerPhone;
    volunteer.status = 'active';
    volunteer.assigned_coordinator_id = coordinator._id;
    volunteer.total_missions = volunteer.total_missions || 0;
    volunteer.skills = Array.isArray(volunteer.skills) ? volunteer.skills : [];
    volunteer.languages = Array.isArray(volunteer.languages) ? volunteer.languages : [];
    await volunteer.save();
  }

  return {
    coordinator,
    fieldOfficer,
    volunteer,
  };
}

async function seedSurvexUsers(config) {
  const warnings = [];

  if (!config.coordinatorPhone || !config.fieldOfficerPhone) {
    warnings.push(
      'Skipped Survex WhatsApp user seeding because coordinator/field officer phone numbers are missing.'
    );
    return { coordinator: null, fieldOfficer: null, warnings };
  }

  if (config.survexPassword.length < 8) {
    warnings.push('Skipped Survex WhatsApp user seeding because SERVEX_RESET_SURVEX_PASSWORD is shorter than 8 characters.');
    return { coordinator: null, fieldOfficer: null, warnings };
  }

  const passwordHash = await hashSurvexPassword(config.survexPassword);

  const survexCoordinator = await SurvexUser.create({
    name: config.coordinatorName,
    phone: config.coordinatorPhone,
    role: 'coordinator',
    password_hash: passwordHash,
    is_active: true,
  });

  const survexFieldOfficer = await SurvexUser.create({
    name: config.fieldOfficerName,
    phone: config.fieldOfficerPhone,
    role: 'field_officer',
    assignedCoordinatorId: survexCoordinator._id,
    password_hash: passwordHash,
    is_active: true,
  });

  return {
    coordinator: survexCoordinator,
    fieldOfficer: survexFieldOfficer,
    warnings,
  };
}

export async function resetAndSeedServeXFreshStart(overrides = {}) {
  const config = resolveConfig(overrides);

  await purgeData();

  const seededMain = await seedMainServeXUsers(config);
  const seededSurvex = await seedSurvexUsers(config);

  return {
    identities: {
      coordinator: {
        name: seededMain.coordinator.name,
        email: seededMain.coordinator.email,
        id: seededMain.coordinator.id,
      },
      fieldOfficer: {
        name: seededMain.fieldOfficer.name,
        email: seededMain.fieldOfficer.email,
        id: seededMain.fieldOfficer.id,
        assignedCoordinatorId: seededMain.fieldOfficer.assigned_coordinator_id?.toString() || null,
      },
      volunteer: {
        name: seededMain.volunteer.full_name,
        email: seededMain.volunteer.email,
        id: seededMain.volunteer.id,
        assignedCoordinatorId: seededMain.volunteer.assigned_coordinator_id?.toString() || null,
      },
    },
    phones: {
      coordinator: config.coordinatorPhone || null,
      fieldOfficer: config.fieldOfficerPhone || null,
      volunteer: config.volunteerPhone || null,
    },
    survexSeeded: Boolean(seededSurvex.coordinator && seededSurvex.fieldOfficer),
    warnings: seededSurvex.warnings,
  };
}

export async function ensureServeXSeedOnEmptyDb(overrides = {}) {
  const userCount = await User.countDocuments({});
  if (userCount > 0) {
    return {
      seeded: false,
      reason: 'users_already_exist',
    };
  }

  const config = resolveConfig(overrides);
  const seededMain = await seedMainServeXUsers(config);
  const seededSurvex = await seedSurvexUsers(config);

  return {
    seeded: true,
    identities: {
      coordinator: {
        name: seededMain.coordinator.name,
        email: seededMain.coordinator.email,
        id: seededMain.coordinator.id,
      },
      fieldOfficer: {
        name: seededMain.fieldOfficer.name,
        email: seededMain.fieldOfficer.email,
        id: seededMain.fieldOfficer.id,
        assignedCoordinatorId: seededMain.fieldOfficer.assigned_coordinator_id?.toString() || null,
      },
      volunteer: {
        name: seededMain.volunteer.full_name,
        email: seededMain.volunteer.email,
        id: seededMain.volunteer.id,
        assignedCoordinatorId: seededMain.volunteer.assigned_coordinator_id?.toString() || null,
      },
    },
    survexSeeded: Boolean(seededSurvex.coordinator && seededSurvex.fieldOfficer),
    warnings: seededSurvex.warnings,
  };
}

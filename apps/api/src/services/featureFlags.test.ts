import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import {
  EMAIL_AUTOMATION_ENV_NAME,
  hasFeature,
  isEmailAutomationEnabled,
} from "./featureFlags";

type FirmFindUnique = typeof prisma.firm.findUnique;
type MockFirmRecord = Awaited<ReturnType<FirmFindUnique>>;

function stubFindUnique(result: MockFirmRecord): FirmFindUnique {
  return ((..._args: Parameters<FirmFindUnique>) =>
    Promise.resolve(result) as ReturnType<FirmFindUnique>) as unknown as FirmFindUnique;
}

async function main() {
  const firmDelegate = prisma.firm as {
    findUnique: FirmFindUnique;
  };
  const originalFindUnique = firmDelegate.findUnique.bind(prisma.firm);
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEmailAutomationFlag = process.env[EMAIL_AUTOMATION_ENV_NAME];

  try {
    delete process.env[EMAIL_AUTOMATION_ENV_NAME];
    assert.equal(
      isEmailAutomationEnabled(),
      true,
      "email automation should default to enabled to preserve existing behavior"
    );

    process.env[EMAIL_AUTOMATION_ENV_NAME] = "false";
    assert.equal(isEmailAutomationEnabled(), false);

    process.env[EMAIL_AUTOMATION_ENV_NAME] = " Off ";
    assert.equal(isEmailAutomationEnabled(), false);

    process.env[EMAIL_AUTOMATION_ENV_NAME] = "yes";
    assert.equal(isEmailAutomationEnabled(), true);

    process.env[EMAIL_AUTOMATION_ENV_NAME] = "unexpected";
    assert.equal(
      isEmailAutomationEnabled(),
      true,
      "unrecognized values should fall back to the default-enabled contract"
    );

    process.env.NODE_ENV = "development";
    firmDelegate.findUnique = stubFindUnique(null);
    assert.equal(await hasFeature("firm-dev", "duplicates_detection"), true);
    assert.equal(await hasFeature("firm-dev", "insurance_extraction"), false);

    firmDelegate.findUnique = stubFindUnique({ features: ["insurance_extraction", "crm_sync"] } as never);
    assert.equal(await hasFeature("firm-with-flags", "insurance_extraction"), true);
    assert.equal(await hasFeature("firm-with-flags", "court_extraction"), false);

    firmDelegate.findUnique = stubFindUnique({ features: { malformed: true } } as never);
    assert.equal(await hasFeature("firm-malformed", "duplicates_detection"), true);

    process.env.NODE_ENV = "production";
    firmDelegate.findUnique = stubFindUnique(null);
    assert.equal(await hasFeature("firm-prod", "duplicates_detection"), false);

    console.log("feature flag tests passed");
  } finally {
    firmDelegate.findUnique = originalFindUnique;

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalEmailAutomationFlag === undefined) {
      delete process.env[EMAIL_AUTOMATION_ENV_NAME];
    } else {
      process.env[EMAIL_AUTOMATION_ENV_NAME] = originalEmailAutomationFlag;
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import "dotenv/config";

import { Role } from "@prisma/client";

process.env.ENABLE_INLINE_DOCUMENT_WORKER = "false";

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { signToken } from "../../lib/jwt";
import { buildExportBundle } from "../../services/export/contract";
import { app } from "../server";
import { assert, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

async function main() {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const suffix = Date.now();
  const firmId = `demand-review-firm-${suffix}`;
  const caseId = `demand-review-case-${suffix}`;
  const requesterUserId = `demand-review-requester-${suffix}`;
  const reviewerUserId = `demand-review-reviewer-${suffix}`;
  const visibleDocId = `demand-review-visible-doc-${suffix}`;
  const blockedDocId = `demand-review-doc-${suffix}`;
  const blockedPackageId = `demand-review-package-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Demand Review Test Firm",
      features: ["demand_narratives"],
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Demand Review Matter",
      caseNumber: `DR-${suffix}`,
      clientName: "Dana Review",
      status: "open",
    },
  });

  const requesterToken = signToken({
    userId: requesterUserId,
    firmId,
    role: Role.PARALEGAL,
    email: "requester@example.com",
  });
  const reviewerToken = signToken({
    userId: reviewerUserId,
    firmId,
    role: Role.PLATFORM_ADMIN,
    email: "reviewer@example.com",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const generateResponse = await fetch(`${baseUrl}/cases/${caseId}/narrative`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requesterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "demand_rationale",
        tone: "neutral",
      }),
    });
    assert(generateResponse.status === 200, `Expected generate route to return 200, got ${generateResponse.status}`);
    const generateJson = (await generateResponse.json()) as {
      ok?: boolean;
      status?: string;
      item?: { id?: string; status?: string; text?: string | null; canViewText?: boolean } | null;
      message?: string;
    };
    assert(generateJson.ok === true, "Expected generate route to succeed.");
    assert(generateJson.status === "pending_dev_review", `Expected pending_dev_review, got ${generateJson.status}`);
    assert(generateJson.item == null, "Requester should not receive the hidden draft item before release.");
    assert(
      (generateJson.message ?? "").includes("mandatory internal developer review"),
      `Expected requester message to mention mandatory review, got ${generateJson.message}`
    );

    const storedDrafts = await prisma.demandNarrativeDraft.findMany({
      where: { firmId, caseId },
      orderBy: { createdAt: "desc" },
    });
    const draftId = String(storedDrafts[0]?.id ?? "");
    assert(draftId.length > 0, "Expected generation to persist a draft id.");

    const storedDraft = await prisma.demandNarrativeDraft.findUnique({
      where: { id: draftId },
    });
    assert(storedDraft !== null, "Expected demand narrative draft row to persist.");
    assert(storedDraft!.status === "PENDING_DEV_REVIEW", `Expected stored status PENDING_DEV_REVIEW, got ${storedDraft!.status}`);
    assert(storedDraft!.generatedText.length > 0, "Expected stored draft text to be retained for internal review.");

    const requesterListResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    assert(requesterListResponse.status === 200, `Expected requester list route to return 200, got ${requesterListResponse.status}`);
    const requesterListJson = (await requesterListResponse.json()) as {
      ok?: boolean;
      items?: Array<{ id: string; text?: string | null; status?: string }>;
    };
    assert(requesterListJson.ok === true, "Expected requester list route to succeed.");
    const requesterDraft = requesterListJson.items?.find((item) => item.id === draftId);
    assert(requesterDraft == null, "Requester list should hide unreleased drafts completely.");

    const reviewerListResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives`, {
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    assert(reviewerListResponse.status === 200, `Expected reviewer list route to return 200, got ${reviewerListResponse.status}`);
    const reviewerListJson = (await reviewerListResponse.json()) as {
      ok?: boolean;
      items?: Array<{ id: string; text?: string | null; status?: string }>;
    };
    const reviewerDraft = reviewerListJson.items?.find((item) => item.id === draftId);
    assert(Boolean(reviewerDraft?.text && reviewerDraft.text.length > 0), "Reviewer should see draft text while pending review.");

    const requesterApproveResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives/${draftId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    assert(requesterApproveResponse.status === 403, `Expected requester approve to return 403, got ${requesterApproveResponse.status}`);

    const reviewerApproveResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives/${draftId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    assert(reviewerApproveResponse.status === 200, `Expected reviewer approve to return 200, got ${reviewerApproveResponse.status}`);
    const reviewerApproveJson = (await reviewerApproveResponse.json()) as { item?: { status?: string } };
    assert(
      reviewerApproveJson.item?.status === "dev_approved",
      `Expected dev_approved after approval, got ${reviewerApproveJson.item?.status}`
    );

    const requesterAfterApproveResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterAfterApproveJson = (await requesterAfterApproveResponse.json()) as {
      items?: Array<{ id: string; text?: string | null; status?: string }>;
    };
    const requesterAfterApproveDraft = requesterAfterApproveJson.items?.find((item) => item.id === draftId);
    assert(requesterAfterApproveDraft == null, "Requester should remain blocked until release.");

    const reviewerReleaseResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives/${draftId}/release`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    assert(reviewerReleaseResponse.status === 200, `Expected reviewer release to return 200, got ${reviewerReleaseResponse.status}`);
    const reviewerReleaseJson = (await reviewerReleaseResponse.json()) as { item?: { status?: string } };
    assert(
      reviewerReleaseJson.item?.status === "released_to_requester",
      `Expected released_to_requester after release, got ${reviewerReleaseJson.item?.status}`
    );

    const requesterAfterReleaseResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-narratives`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterAfterReleaseJson = (await requesterAfterReleaseResponse.json()) as {
      items?: Array<{ id: string; text?: string | null; status?: string }>;
    };
    const requesterAfterReleaseDraft = requesterAfterReleaseJson.items?.find((item) => item.id === draftId);
    assert(
      requesterAfterReleaseDraft?.status === "released_to_requester",
      "Requester should see released_to_requester status after release."
    );
    assert(
      Boolean(requesterAfterReleaseDraft?.text && requesterAfterReleaseDraft.text.length > 0),
      "Requester should see draft text only after release."
    );

    await prisma.document.create({
      data: {
        id: visibleDocId,
        firmId,
        source: "upload",
        spacesKey: `tests/${visibleDocId}.pdf`,
        originalName: "visible-case-document.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        routedCaseId: caseId,
        processedAt: new Date(),
      },
    });
    await prisma.document.create({
      data: {
        id: blockedDocId,
        firmId,
        source: "demand_package",
        spacesKey: `tests/${blockedDocId}.pdf`,
        originalName: "blocked-demand-package.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        routedCaseId: caseId,
        processedAt: new Date(),
      },
    });
    await prisma.demandPackage.create({
      data: {
        id: blockedPackageId,
        firmId,
        caseId,
        title: "Blocked Demand Package",
        status: "pending_dev_review",
        generatedDocId: blockedDocId,
        generatedAt: new Date(),
      },
    });

    const requesterCaseDocsResponse = await fetch(`${baseUrl}/cases/${caseId}/documents`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterCaseDocsJson = (await requesterCaseDocsResponse.json()) as {
      items?: Array<{ id: string }>;
    };
    assert(
      !requesterCaseDocsJson.items?.some((item) => item.id === blockedDocId),
      "Requester case documents should hide blocked demand package documents."
    );
    assert(
      Boolean(requesterCaseDocsJson.items?.some((item) => item.id === visibleDocId)),
      "Requester case documents should retain non-demand-package documents."
    );

    const requesterMeDocsResponse = await fetch(`${baseUrl}/me/documents?limit=50`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterMeDocsJson = (await requesterMeDocsResponse.json()) as {
      items?: Array<{ id: string }>;
    };
    assert(
      !requesterMeDocsJson.items?.some((item) => item.id === blockedDocId),
      "Requester /me/documents should hide blocked demand package documents."
    );
    assert(
      Boolean(requesterMeDocsJson.items?.some((item) => item.id === visibleDocId)),
      "Requester /me/documents should retain non-demand-package documents."
    );

    const blockedDownloadResponse = await fetch(`${baseUrl}/documents/${blockedDocId}/download`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
        Accept: "application/json",
      },
    });
    assert(blockedDownloadResponse.status === 403, `Expected blocked demand package download to return 403, got ${blockedDownloadResponse.status}`);
    const blockedDownloadJson = (await blockedDownloadResponse.json()) as { ok?: boolean; error?: string };
    assert(blockedDownloadJson.ok === false, "Expected blocked demand package download to return ok: false.");
    assert(
      (blockedDownloadJson.error ?? "").includes("blocked pending internal developer approval"),
      `Expected blocked download message to mention internal approval, got ${blockedDownloadJson.error}`
    );

    const blockedPreviewResponse = await fetch(`${baseUrl}/documents/${blockedDocId}/preview`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
        Accept: "application/json",
      },
    });
    assert(blockedPreviewResponse.status === 403, `Expected blocked demand package preview to return 403, got ${blockedPreviewResponse.status}`);

    const requesterPackagesResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-packages`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterPackagesJson = (await requesterPackagesResponse.json()) as {
      items?: Array<{ id: string; status?: string }>;
    };
    assert(
      !requesterPackagesJson.items?.some((item) => item.id === blockedPackageId),
      "Requester should not see blocked demand packages before release."
    );

    const reviewerPackagesResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-packages`, {
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    const reviewerPackagesJson = (await reviewerPackagesResponse.json()) as {
      items?: Array<{ id: string; status?: string }>;
    };
    assert(
      Boolean(reviewerPackagesJson.items?.some((item) => item.id === blockedPackageId && item.status === "pending_dev_review")),
      "Reviewer should see the pending demand package."
    );

    const blockedExportBundle = await buildExportBundle(caseId, firmId, { includeTimeline: false, includeSummary: false });
    assert(blockedExportBundle != null, "Expected export bundle to build.");
    assert(
      blockedExportBundle!.documents.some((doc) => doc.id === visibleDocId),
      "Visible case docs should still be included in exports."
    );
    assert(
      !blockedExportBundle!.documents.some((doc) => doc.id === blockedDocId),
      "Blocked demand package document should be excluded from exports before release."
    );

    const reviewerPackageReleaseTooEarlyResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-packages/${blockedPackageId}/release`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    assert(
      reviewerPackageReleaseTooEarlyResponse.status === 409,
      `Expected package release before approval to return 409, got ${reviewerPackageReleaseTooEarlyResponse.status}`
    );

    const reviewerPackageApproveResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-packages/${blockedPackageId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    assert(
      reviewerPackageApproveResponse.status === 200,
      `Expected reviewer package approve to return 200, got ${reviewerPackageApproveResponse.status}`
    );
    const reviewerPackageApproveJson = (await reviewerPackageApproveResponse.json()) as {
      item?: { status?: string };
    };
    assert(reviewerPackageApproveJson.item?.status === "dev_approved", "Package should move to dev_approved.");

    const reviewerPackageReleaseResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-packages/${blockedPackageId}/release`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reviewerToken}`,
      },
    });
    assert(
      reviewerPackageReleaseResponse.status === 200,
      `Expected reviewer package release to return 200, got ${reviewerPackageReleaseResponse.status}`
    );
    const reviewerPackageReleaseJson = (await reviewerPackageReleaseResponse.json()) as {
      item?: { status?: string };
    };
    assert(
      reviewerPackageReleaseJson.item?.status === "released_to_requester",
      "Package should move to released_to_requester."
    );

    const requesterReleasedPackagesResponse = await fetch(`${baseUrl}/cases/${caseId}/demand-packages`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterReleasedPackagesJson = (await requesterReleasedPackagesResponse.json()) as {
      items?: Array<{ id: string; status?: string }>;
    };
    assert(
      Boolean(
        requesterReleasedPackagesJson.items?.some(
          (item) => item.id === blockedPackageId && item.status === "released_to_requester"
        )
      ),
      "Requester should see the released demand package."
    );

    const requesterReleasedCaseDocsResponse = await fetch(`${baseUrl}/cases/${caseId}/documents`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterReleasedCaseDocsJson = (await requesterReleasedCaseDocsResponse.json()) as {
      items?: Array<{ id: string }>;
    };
    assert(
      Boolean(requesterReleasedCaseDocsJson.items?.some((item) => item.id === blockedDocId)),
      "Requester case documents should show released demand package documents."
    );

    const requesterReleasedMeDocsResponse = await fetch(`${baseUrl}/me/documents?limit=50`, {
      headers: {
        Authorization: `Bearer ${requesterToken}`,
      },
    });
    const requesterReleasedMeDocsJson = (await requesterReleasedMeDocsResponse.json()) as {
      items?: Array<{ id: string }>;
    };
    assert(
      Boolean(requesterReleasedMeDocsJson.items?.some((item) => item.id === blockedDocId)),
      "Requester /me/documents should show released demand package documents."
    );

    const releasedExportBundle = await buildExportBundle(caseId, firmId, { includeTimeline: false, includeSummary: false });
    assert(
      releasedExportBundle!.documents.some((doc) => doc.id === blockedDocId),
      "Released demand package document should be included in exports."
    );

    console.log("Demand narrative review flow tests passed");
  } finally {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    await stopTestServer(server);
    await prisma.demandPackage.deleteMany({ where: { firmId, caseId } }).catch(() => {});
    await prisma.demandNarrativeDraft.deleteMany({ where: { firmId, caseId } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { firmId } }).catch(() => {});
    await prisma.document.deleteMany({ where: { firmId, routedCaseId: caseId } }).catch(() => {});
    await prisma.legalCase.deleteMany({ where: { id: caseId } }).catch(() => {});
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const exitCode = process.exitCode ?? 0;
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(exitCode);
  });

import { expect, test } from "@playwright/test";

type Fixture = { goalId: string; evidenceRef: string };

async function fixture(page: import("@playwright/test").Page): Promise<Fixture> {
  if (page.url() === "about:blank") await page.goto("/learning");
  return page.evaluate(async () => {
    const learning = await fetch("/api/learning", { cache: "no-store" }).then((response) => response.json());
    const goal = learning.goals.find((item: { title: string }) => item.title === "Phase 1 Mastery Browser Fixture");
    const evidence = await fetch("/api/evidence", { cache: "no-store" }).then((response) => response.json());
    const item = evidence.items.find((entry: { sourceType: string }) => entry.sourceType === "phase1_e2e_fixture");
    return { goalId: goal.id, evidenceRef: `evidence_item:${item.id}` };
  });
}

async function act(page: import("@playwright/test").Page, body: Record<string, unknown>) {
  return page.evaluate(async (payload) => {
    const response = await fetch("/api/learning/mastery", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }, body);
}

test.describe.serial("Mastery Truth Contract", () => {
  test("course completion exposes missing hard Gates and never auto-masters", async ({ page }) => {
    const { goalId } = await fixture(page);
    const result = await act(page, { action: "evaluate", goalId });
    expect(result.status).toBe(200);
    expect(result.body.decision.overallStatus).toBe("mastery_pending");
    expect(result.body.decision.missingGates).toHaveLength(8);

    await page.goto("/learning");
    await expect(page.getByTestId("mastery-truth")).toBeVisible();
    await expect(page.getByTestId("mastery-truth")).toContainText("课程已完成");
    await expect(page.getByTestId("mastery-truth")).toContainText("8 个门槛已通过 0 个");
    await expect(page.getByTestId("mastery-truth")).toContainText("待完成掌握");
  });

  test("failed Transfer creates remediation and a clean retake preserves history", async ({ page }) => {
    const { goalId, evidenceRef } = await fixture(page);
    await act(page, { action: "record_gate_attempt", goalId, clientRequestId: crypto.randomUUID(), gateType: "transfer", observedScore: 0.2, evidenceRefs: [evidenceRef], sourceRefs: [], notes: "browser failure" });
    const failed = await act(page, { action: "evaluate", goalId });
    expect(failed.body.decision.overallStatus).toBe("remediation_required");
    expect(failed.body.snapshot.remediation.some((item: { gateType: string; status: string }) => item.gateType === "transfer" && item.status === "active")).toBe(true);

    await page.goto("/learning");
    await expect(page.getByText("掌握差距报告")).toBeVisible();
    await expect(page.locator(".mastery-remediation")).toContainText("迁移");

    await act(page, { action: "record_gate_attempt", goalId, clientRequestId: crypto.randomUUID(), gateType: "transfer", observedScore: 0.95, evidenceRefs: [evidenceRef], sourceRefs: [], notes: "clean browser retake" });
    const snapshot = await page.evaluate(async (id) => fetch(`/api/learning/mastery?goalId=${id}`, { cache: "no-store" }).then((response) => response.json()), goalId);
    const attempts = snapshot.attempts.filter((item: { gateType: string }) => item.gateType === "transfer");
    expect(attempts).toHaveLength(2);
    expect(attempts.map((item: { status: string }) => item.status)).toEqual(["passed", "failed"]);
  });

  test("all eight production-service Gates create only a pending Evidence Candidate", async ({ page }) => {
    const { goalId, evidenceRef } = await fixture(page);
    for (const gateType of ["concept", "application", "delayed_recall", "artifact_project", "defense", "independence", "evidence"]) {
      const response = await act(page, { action: "record_gate_attempt", goalId, clientRequestId: crypto.randomUUID(), gateType, observedScore: gateType === "evidence" ? 1 : 0.95, evidenceRefs: [evidenceRef], sourceRefs: [], notes: "isolated browser pass fixture" });
      expect(response.status).toBe(200);
    }
    const result = await act(page, { action: "evaluate", goalId });
    expect(result.body.decision.overallStatus).toBe("mastered");
    expect(result.body.formalAbilityUpdated).toBe(false);
    expect(result.body.decision.growthCandidateId).toBeTruthy();

    const evidence = await page.evaluate(async () => fetch("/api/evidence", { cache: "no-store" }).then((response) => response.json()));
    expect(evidence.abilityChanges).toHaveLength(0);
    expect(evidence.pendingCandidates.some((item: { id: string }) => item.id === result.body.decision.growthCandidateId)).toBe(true);

    await page.goto("/learning");
    await expect(page.getByTestId("mastery-truth")).toContainText("8 个门槛已通过 8 个");
    await expect(page.getByTestId("mastery-truth")).toContainText("已真正掌握");
    await expect(page.getByTestId("mastery-truth")).toContainText("用户批准前，正式能力保持不变");
  });

  test("390px and 430px Mastery dashboard have no horizontal overflow", async ({ page }) => {
    for (const width of [390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/learning");
      await expect(page.getByTestId("mastery-truth")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  });
});

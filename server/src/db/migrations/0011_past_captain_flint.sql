-- BACKFILL, hand-added ahead of the generated statements.
-- `reviews.run_id` and `reviews.agent_id` have never carried a FK, so either
-- may point at a row that has since been deleted. ADD CONSTRAINT fails on an
-- orphan, so null those out first. NOT EXISTS rather than NOT IN: the latter
-- yields no rows at all if the subquery ever returns a NULL.
-- Editing a migration by hand is allowed only here — this file has not been
-- applied anywhere yet. A MERGED migration is still never edited.
UPDATE "reviews" SET "run_id" = NULL
WHERE "run_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "agent_runs" WHERE "agent_runs"."id" = "reviews"."run_id");--> statement-breakpoint
UPDATE "reviews" SET "agent_id" = NULL
WHERE "agent_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "agents" WHERE "agents"."id" = "reviews"."agent_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_status_idx" ON "agent_runs" USING btree ("pr_id","status");
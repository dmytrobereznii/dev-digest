CREATE TABLE "eval_case_results" (
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_name" text NOT NULL,
	"expectation_type" text NOT NULL,
	"pass" boolean NOT NULL,
	"matched" integer NOT NULL,
	"unjudged" integer NOT NULL,
	"kept" integer NOT NULL,
	"dropped" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"cost_usd" double precision,
	CONSTRAINT "eval_case_results_run_id_case_id_pk" PRIMARY KEY("run_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"finding_id" uuid,
	"expectation_type" text NOT NULL,
	"file" text NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"input_diff" text NOT NULL,
	"pr_title" text NOT NULL,
	"pr_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"agent_version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"traces_passed" integer,
	"traces_total" integer NOT NULL,
	"cost_usd" double precision,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_case_results_case_idx" ON "eval_case_results" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_finding_id_unique" ON "eval_cases" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "eval_cases_agent_idx" ON "eval_cases" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "eval_runs_agent_ran_idx" ON "eval_runs" USING btree ("agent_id","ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running" ON "eval_runs" USING btree ("agent_id") WHERE "eval_runs"."status" = 'running';
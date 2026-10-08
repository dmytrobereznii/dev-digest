CREATE TABLE "agent_context_docs" (
	"repo_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "agent_context_docs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "agent_context_docs_repo_id_agent_id_path_pk" PRIMARY KEY("repo_id","agent_id","path")
);
--> statement-breakpoint
CREATE TABLE "skill_context_docs" (
	"repo_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "skill_context_docs_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "skill_context_docs_repo_id_skill_id_path_pk" PRIMARY KEY("repo_id","skill_id","path")
);
--> statement-breakpoint
ALTER TABLE "agent_context_docs" ADD CONSTRAINT "agent_context_docs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_context_docs" ADD CONSTRAINT "agent_context_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
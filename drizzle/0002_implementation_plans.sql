CREATE TABLE `implementation_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `plan_json` text NOT NULL,
  `estimated_model_cents` integer NOT NULL,
  `estimated_execution_seconds` integer NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `approved_by` text,
  `approved_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_implementation_plans_run_revision` ON `implementation_plans` (`run_id`,`revision`);
--> statement-breakpoint
CREATE INDEX `idx_implementation_plans_run_status` ON `implementation_plans` (`run_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;

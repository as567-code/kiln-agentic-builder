CREATE TABLE `execution_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `project_id` text NOT NULL,
  `run_id` text NOT NULL,
  `kind` text DEFAULT 'verify' NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `attempt` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer DEFAULT 3 NOT NULL,
  `payload_artifact_key` text NOT NULL,
  `result_artifact_key` text,
  `lease_token_hash` text,
  `lease_expires_at` text,
  `error_code` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `completed_at` text,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_execution_jobs_claim` ON `execution_jobs` (`status`,`lease_expires_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_execution_jobs_run` ON `execution_jobs` (`run_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;

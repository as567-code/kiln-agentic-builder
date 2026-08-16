CREATE TABLE `run_events` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `type` text NOT NULL,
  `data_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_run_events_run_sequence` ON `run_events` (`run_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `idx_run_events_run_created` ON `run_events` (`run_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `file_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `patch_id` text,
  `revision` integer NOT NULL,
  `path` text NOT NULL,
  `object_key` text NOT NULL,
  `sha256` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `language` text DEFAULT 'text' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`patch_id`) REFERENCES `patches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_file_snapshots_run_path_revision` ON `file_snapshots` (`run_id`,`path`,`revision`);
--> statement-breakpoint
CREATE INDEX `idx_file_snapshots_run_revision` ON `file_snapshots` (`run_id`,`revision`);
--> statement-breakpoint
CREATE TABLE `sandbox_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_ref` text,
  `status` text DEFAULT 'provisioning' NOT NULL,
  `preview_url` text,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sandbox_sessions_run` ON `sandbox_sessions` (`run_id`);
--> statement-breakpoint
CREATE INDEX `idx_sandbox_sessions_status_expiry` ON `sandbox_sessions` (`status`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `test_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `command_label` text NOT NULL,
  `passed` integer DEFAULT 0 NOT NULL,
  `failed` integer DEFAULT 0 NOT NULL,
  `duration_ms` integer DEFAULT 0 NOT NULL,
  `report_artifact_id` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`report_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_test_runs_run_kind` ON `test_runs` (`run_id`,`kind`);
--> statement-breakpoint
CREATE TABLE `usage_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `project_id` text NOT NULL,
  `run_id` text,
  `category` text NOT NULL,
  `units` integer NOT NULL,
  `unit_kind` text NOT NULL,
  `cost_micros` integer DEFAULT 0 NOT NULL,
  `provider` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_usage_ledger_owner_created` ON `usage_ledger` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_usage_ledger_run` ON `usage_ledger` (`run_id`);
--> statement-breakpoint
CREATE TABLE `api_rate_windows` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `bucket` text NOT NULL,
  `window_start` text NOT NULL,
  `request_count` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_api_rate_windows_owner_bucket_window` ON `api_rate_windows` (`owner_id`,`bucket`,`window_start`);
--> statement-breakpoint
CREATE INDEX `idx_api_rate_windows_created` ON `api_rate_windows` (`created_at`);
--> statement-breakpoint
PRAGMA optimize;

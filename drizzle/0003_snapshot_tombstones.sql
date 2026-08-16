ALTER TABLE `file_snapshots` ADD `deleted` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
PRAGMA optimize;

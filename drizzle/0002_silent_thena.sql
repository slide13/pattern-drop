CREATE TABLE `session_images` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`object_key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_session_images_session_created` ON `session_images` (`session_id`,`created_at`);
CREATE TABLE `transfer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`object_key` text,
	`width` integer,
	`height` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

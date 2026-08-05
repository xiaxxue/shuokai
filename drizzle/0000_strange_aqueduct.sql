CREATE TABLE `agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`proposal` text NOT NULL,
	`review_at` text NOT NULL,
	`accepted_a` integer DEFAULT false NOT NULL,
	`accepted_b` integer DEFAULT false NOT NULL,
	`activated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agreements_room_id_unique` ON `agreements` (`room_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`token_hash` text NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_participants_room_role` ON `participants` (`room_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_participants_token_hash` ON `participants` (`token_hash`);--> statement-breakpoint
CREATE TABLE `perspectives` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`fact` text NOT NULL,
	`meaning` text NOT NULL,
	`impact` text NOT NULL,
	`request` text NOT NULL,
	`approved_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_perspectives_owner_version` ON `perspectives` (`room_id`,`participant_id`,`version`);--> statement-breakpoint
CREATE TABLE `private_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`transcript` text NOT NULL,
	`clarification` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_private_drafts_owner` ON `private_drafts` (`room_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `room_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text,
	`event_type` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_room_events_timeline` ON `room_events` (`room_id`,`id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`state` text DEFAULT 'GOAL_SETTING' NOT NULL,
	`goal` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rooms_code` ON `rooms` (`code`);--> statement-breakpoint
CREATE TABLE `shared_views` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`common_ground` text NOT NULL,
	`disagreement` text NOT NULL,
	`core_question` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_views_room_id_unique` ON `shared_views` (`room_id`);
--> statement-breakpoint
PRAGMA optimize;

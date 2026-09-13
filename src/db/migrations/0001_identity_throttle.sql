CREATE TABLE `identity_throttle` (
	`id` varchar(320) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`window_started_at` datetime(3) NOT NULL,
	`blocked_until` datetime(3),
	CONSTRAINT `identity_throttle_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_throttle_window` ON `identity_throttle` (`window_started_at`);
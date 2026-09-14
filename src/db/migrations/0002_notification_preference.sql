CREATE TABLE `notification_preference` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`channel` enum('IN_APP','EMAIL','DISCORD') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_preference_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_preference_user_channel` UNIQUE(`user_id`,`channel`)
);
--> statement-breakpoint
ALTER TABLE `notification_preference` ADD CONSTRAINT `notification_preference_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;
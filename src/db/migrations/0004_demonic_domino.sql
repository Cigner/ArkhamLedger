CREATE TABLE `issue_report` (
	`id` char(26) NOT NULL,
	`reporter_id` char(26),
	`message` text NOT NULL,
	`source_path` varchar(500) NOT NULL,
	`status` enum('NEW','DONE','PLANNED','REJECTED','NEEDS_MORE_INFO') NOT NULL DEFAULT 'NEW',
	`status_changed_by` char(26),
	`status_changed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `issue_report_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notification` MODIFY COLUMN `type` enum('CAMPAIGN_INVITED','CAMPAIGN_MEMBER_JOINED','SESSION_CREATED','AVAILABILITY_REQUESTED','AVAILABILITY_REMINDER','COLLECTION_CLOSED','SESSION_SCHEDULED','SESSION_RESCHEDULED','SESSION_CANCELLED','NO_NEXT_SESSION','ISSUE_REPORTED') NOT NULL;--> statement-breakpoint
ALTER TABLE `issue_report` ADD CONSTRAINT `issue_report_reporter_id_auth_user_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `issue_report` ADD CONSTRAINT `issue_report_status_changed_by_auth_user_id_fk` FOREIGN KEY (`status_changed_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_issue_report_status` ON `issue_report` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_issue_report_reporter` ON `issue_report` (`reporter_id`,`created_at`);
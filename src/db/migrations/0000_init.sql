CREATE TABLE `auth_account` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`password` text,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `auth_account_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_account_provider` UNIQUE(`provider_id`,`account_id`)
);
--> statement-breakpoint
CREATE TABLE `auth_rate_limit` (
	`id` char(26) NOT NULL,
	`key` varchar(255) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`last_request` bigint NOT NULL,
	CONSTRAINT `auth_rate_limit_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_rate_limit_key` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`ip_address` varchar(45),
	`user_agent` varchar(512),
	`impersonated_by` varchar(26),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `auth_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_session_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` char(26) NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` varchar(512),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`banned` boolean NOT NULL DEFAULT false,
	`ban_reason` varchar(255),
	`ban_expires` datetime(3),
	`status` enum('PENDING_ACTIVATION','ACTIVE','DISABLED') NOT NULL DEFAULT 'PENDING_ACTIVATION',
	`timezone` varchar(64) NOT NULL DEFAULT 'Europe/Warsaw',
	`locale` varchar(10) NOT NULL DEFAULT 'en',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `auth_user_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_user_email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` char(26) NOT NULL,
	`identifier` varchar(254) NOT NULL,
	`value` varchar(255) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `auth_verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_activation_token` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_by` char(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `user_activation_token_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_activation_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `campaign` (
	`id` char(26) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`owner_id` char(26) NOT NULL,
	`scenario_id` char(26),
	`status` enum('PLANNING','ACTIVE','ON_HIATUS','COMPLETED','ARCHIVED') NOT NULL DEFAULT 'PLANNING',
	`timezone` varchar(64) NOT NULL DEFAULT 'Europe/Warsaw',
	`default_min_session_hours` tinyint unsigned NOT NULL DEFAULT 6,
	`default_quorum_mode` enum('HALF_PLUS_ONE','ALL','CUSTOM') NOT NULL DEFAULT 'HALF_PLUS_ONE',
	`default_quorum_value` tinyint unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `campaign_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_integration` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`type` enum('DISCORD_WEBHOOK') NOT NULL,
	`config` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_integration_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_integration_campaign_type` UNIQUE(`campaign_id`,`type`)
);
--> statement-breakpoint
CREATE TABLE `campaign_invitation` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`target_user_id` char(26),
	`role_on_join` enum('KEEPER','INVESTIGATOR') NOT NULL DEFAULT 'INVESTIGATOR',
	`max_uses` smallint unsigned NOT NULL DEFAULT 1,
	`used_count` smallint unsigned NOT NULL DEFAULT 0,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`created_by` char(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_invitation_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_invitation_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `campaign_member` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`role` enum('KEEPER','INVESTIGATOR') NOT NULL DEFAULT 'INVESTIGATOR',
	`status` enum('ACTIVE','LEFT','REMOVED') NOT NULL DEFAULT 'ACTIVE',
	`joined_at` datetime(3) NOT NULL,
	`left_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_member_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_campaign_member` UNIQUE(`campaign_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `scenario` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26),
	`name` varchar(200) NOT NULL,
	`description` text,
	`created_by` char(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `scenario_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_session` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`scenario_id` char(26),
	`status` enum('DRAFT','COLLECTING','PROPOSED','SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`search_window_start` date NOT NULL,
	`search_window_end` date NOT NULL,
	`grid_start_hour` tinyint unsigned NOT NULL DEFAULT 16,
	`grid_end_hour` tinyint unsigned NOT NULL DEFAULT 24,
	`min_session_hours` tinyint unsigned NOT NULL DEFAULT 6,
	`quorum` tinyint unsigned NOT NULL DEFAULT 1,
	`availability_deadline` datetime(3),
	`timezone` varchar(64) NOT NULL,
	`confirmed_start_utc` datetime(3),
	`confirmed_end_utc` datetime(3),
	`accepted_proposal_id` char(26),
	`set_manually` boolean NOT NULL DEFAULT false,
	`cancelled_reason` varchar(500),
	`created_by` char(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `game_session_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_participant` (
	`id` char(26) NOT NULL,
	`game_session_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`priority` enum('REQUIRED','PREFERRED','OPTIONAL') NOT NULL DEFAULT 'PREFERRED',
	`is_keeper` boolean NOT NULL DEFAULT false,
	`responded_at` datetime(3),
	`attendance` enum('UNKNOWN','ATTENDED','ABSENT') NOT NULL DEFAULT 'UNKNOWN',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `session_participant_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_session_participant` UNIQUE(`game_session_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `availability_slot` (
	`id` char(26) NOT NULL,
	`game_session_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`slot_start_utc` datetime(3) NOT NULL,
	`local_date` date NOT NULL,
	`local_hour` tinyint unsigned NOT NULL,
	`state` enum('YES','IF_NEED_BE','NO') NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `availability_slot_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_availability_slot` UNIQUE(`game_session_id`,`user_id`,`slot_start_utc`)
);
--> statement-breakpoint
CREATE TABLE `schedule_proposal` (
	`id` char(26) NOT NULL,
	`schedule_run_id` char(26) NOT NULL,
	`game_session_id` char(26) NOT NULL,
	`rank` smallint unsigned NOT NULL,
	`start_utc` datetime(3) NOT NULL,
	`end_utc` datetime(3) NOT NULL,
	`score` decimal(5,2) NOT NULL,
	`breakdown` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `schedule_proposal_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_proposal_run_start` UNIQUE(`schedule_run_id`,`start_utc`)
);
--> statement-breakpoint
CREATE TABLE `schedule_run` (
	`id` char(26) NOT NULL,
	`game_session_id` char(26) NOT NULL,
	`algorithm_version` varchar(20) NOT NULL,
	`params` json NOT NULL,
	`triggered_by` char(26),
	`candidate_count` smallint unsigned NOT NULL DEFAULT 0,
	`rejection_summary` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `schedule_run_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`type` enum('CAMPAIGN_INVITED','CAMPAIGN_MEMBER_JOINED','SESSION_CREATED','AVAILABILITY_REQUESTED','AVAILABILITY_REMINDER','SESSION_SCHEDULED','SESSION_RESCHEDULED','SESSION_CANCELLED','NO_NEXT_SESSION') NOT NULL,
	`campaign_id` char(26),
	`game_session_id` char(26),
	`payload` json NOT NULL,
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_delivery` (
	`id` char(26) NOT NULL,
	`notification_id` char(26) NOT NULL,
	`channel` enum('IN_APP','EMAIL','DISCORD') NOT NULL,
	`status` enum('PENDING','SENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
	`attempts` tinyint unsigned NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3) NOT NULL,
	`last_error` varchar(500),
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_delivery_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_delivery_notification_channel` UNIQUE(`notification_id`,`channel`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` char(26) NOT NULL,
	`actor_id` char(26),
	`action` varchar(80) NOT NULL,
	`entity_type` varchar(40) NOT NULL,
	`entity_id` varchar(64),
	`metadata` json,
	`ip_address` varchar(45),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_heartbeat` (
	`id` varchar(32) NOT NULL,
	`beat_at` datetime(3) NOT NULL,
	CONSTRAINT `worker_heartbeat_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auth_account` ADD CONSTRAINT `auth_account_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_session` ADD CONSTRAINT `auth_session_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_activation_token` ADD CONSTRAINT `user_activation_token_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_activation_token` ADD CONSTRAINT `user_activation_token_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign` ADD CONSTRAINT `campaign_owner_id_auth_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign` ADD CONSTRAINT `campaign_scenario_id_scenario_id_fk` FOREIGN KEY (`scenario_id`) REFERENCES `scenario`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_integration` ADD CONSTRAINT `campaign_integration_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_invitation` ADD CONSTRAINT `campaign_invitation_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_invitation` ADD CONSTRAINT `campaign_invitation_target_user_id_auth_user_id_fk` FOREIGN KEY (`target_user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_invitation` ADD CONSTRAINT `campaign_invitation_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_member` ADD CONSTRAINT `campaign_member_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_member` ADD CONSTRAINT `campaign_member_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scenario` ADD CONSTRAINT `scenario_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_session` ADD CONSTRAINT `game_session_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_session` ADD CONSTRAINT `game_session_scenario_id_scenario_id_fk` FOREIGN KEY (`scenario_id`) REFERENCES `scenario`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_session` ADD CONSTRAINT `game_session_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_participant` ADD CONSTRAINT `session_participant_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_participant` ADD CONSTRAINT `session_participant_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availability_slot` ADD CONSTRAINT `availability_slot_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availability_slot` ADD CONSTRAINT `availability_slot_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_proposal` ADD CONSTRAINT `schedule_proposal_schedule_run_id_schedule_run_id_fk` FOREIGN KEY (`schedule_run_id`) REFERENCES `schedule_run`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_proposal` ADD CONSTRAINT `schedule_proposal_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_run` ADD CONSTRAINT `schedule_run_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_run` ADD CONSTRAINT `schedule_run_triggered_by_auth_user_id_fk` FOREIGN KEY (`triggered_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_user_id_auth_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_delivery` ADD CONSTRAINT `notification_delivery_notification_id_notification_id_fk` FOREIGN KEY (`notification_id`) REFERENCES `notification`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actor_id_auth_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_auth_account_user` ON `auth_account` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_auth_session_user` ON `auth_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_auth_session_expires` ON `auth_session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_auth_user_status` ON `auth_user` (`status`);--> statement-breakpoint
CREATE INDEX `ix_auth_user_deleted` ON `auth_user` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `ix_auth_verification_identifier` ON `auth_verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `ix_auth_verification_expires` ON `auth_verification` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_activation_token_user` ON `user_activation_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_activation_token_expires` ON `user_activation_token` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_campaign_owner` ON `campaign` (`owner_id`);--> statement-breakpoint
CREATE INDEX `ix_campaign_status` ON `campaign` (`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `ix_invitation_campaign` ON `campaign_invitation` (`campaign_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `ix_invitation_expires` ON `campaign_invitation` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_member_user` ON `campaign_member` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_member_campaign_role` ON `campaign_member` (`campaign_id`,`status`,`role`);--> statement-breakpoint
CREATE INDEX `ix_scenario_campaign` ON `scenario` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `ix_session_campaign_status` ON `game_session` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_session_deadline` ON `game_session` (`status`,`availability_deadline`);--> statement-breakpoint
CREATE INDEX `ix_session_confirmed` ON `game_session` (`campaign_id`,`confirmed_start_utc`);--> statement-breakpoint
CREATE INDEX `ix_participant_user` ON `session_participant` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_participant_priority` ON `session_participant` (`game_session_id`,`priority`);--> statement-breakpoint
CREATE INDEX `ix_availability_aggregate` ON `availability_slot` (`game_session_id`,`slot_start_utc`);--> statement-breakpoint
CREATE INDEX `ix_availability_user` ON `availability_slot` (`game_session_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `ix_proposal_run_rank` ON `schedule_proposal` (`schedule_run_id`,`rank`);--> statement-breakpoint
CREATE INDEX `ix_run_session` ON `schedule_run` (`game_session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_notification_inbox` ON `notification` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_delivery_queue` ON `notification_delivery` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `ix_audit_entity` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_audit_actor` ON `audit_log` (`actor_id`,`created_at`);
CREATE TABLE `campaign_investigator` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`linked_by` char(26),
	`linked_at` datetime(3) NOT NULL,
	`unlinked_at` datetime(3),
	`unlink_reason` varchar(500),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_investigator_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_campaign_investigator` UNIQUE(`campaign_id`,`investigator_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator` (
	`id` char(26) NOT NULL,
	`lineage_id` char(26) NOT NULL,
	`branched_from_id` char(26),
	`owner_id` char(26) NOT NULL,
	`creator_id` char(26),
	`creator_campaign_id` char(26),
	`status` enum('DRAFT','ACTIVE','RETIRED','DECEASED') NOT NULL DEFAULT 'DRAFT',
	`creation_method` enum('STANDARD_ROLLS','ASSIGNED_ROLLS','MANUAL_ENTRY') NOT NULL,
	`ruleset_id` varchar(80) NOT NULL,
	`ruleset_version` varchar(20) NOT NULL,
	`era` enum('CLASSIC_1920S','MODERN') NOT NULL,
	`first_used_at` datetime(3),
	`archived_at` datetime(3),
	`lock_version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_access_grant` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`viewer_id` char(26) NOT NULL,
	`campaign_id` char(26),
	`level` enum('OWNER','KEEPER','PLAYER','HISTORICAL') NOT NULL,
	`granted_at` datetime(3) NOT NULL,
	`ended_at` datetime(3),
	`final_disclosure_snapshot_id` char(26),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_access_grant_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_backstory_entry` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`category` varchar(80) NOT NULL,
	`content` text NOT NULL,
	`position` smallint unsigned NOT NULL DEFAULT 0,
	`is_key_connection` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_backstory_entry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_characteristic` (
	`investigator_id` char(26) NOT NULL,
	`strength` tinyint unsigned,
	`constitution` tinyint unsigned,
	`size` tinyint unsigned,
	`dexterity` tinyint unsigned,
	`appearance` tinyint unsigned,
	`intelligence` tinyint unsigned,
	`power` tinyint unsigned,
	`education` tinyint unsigned,
	`starting_luck` tinyint unsigned,
	`roll_record` json,
	`age_adjustment` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_characteristic_investigator_id` PRIMARY KEY(`investigator_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_derived_override` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`field_key` varchar(80) NOT NULL,
	`value` varchar(120) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`set_by` char(26),
	`ended_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_derived_override_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_disclosure_snapshot` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`viewer_id` char(26) NOT NULL,
	`campaign_id` char(26),
	`source_snapshot_id` char(26),
	`reason` enum('FIELD_HIDDEN','CAMPAIGN_UNLINKED','CAMPAIGN_LEFT','CAMPAIGN_ENDED','TRANSFERRED','NOTE_RESTRICTED','MANUAL') NOT NULL,
	`schema_version` smallint unsigned NOT NULL,
	`projection` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_disclosure_snapshot_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_edit_grant` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`keeper_id` char(26) NOT NULL,
	`granted_at` datetime(3) NOT NULL,
	`closed_at` datetime(3),
	`closed_reason` varchar(100),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_edit_grant_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_edit_grant_creator` UNIQUE(`investigator_id`,`campaign_id`,`keeper_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_field_visibility` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`field_key` varchar(120) NOT NULL,
	`visibility` enum('PUBLIC','HIDDEN') NOT NULL,
	`updated_by` char(26),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_field_visibility_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_field_visibility` UNIQUE(`investigator_id`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `investigator_finance` (
	`investigator_id` char(26) NOT NULL,
	`credit_rating` tinyint unsigned,
	`cash` decimal(15,2),
	`assets` decimal(18,2),
	`spending_level` decimal(15,2),
	`assets_unbounded_above` boolean NOT NULL DEFAULT false,
	`notes` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_finance_investigator_id` PRIMARY KEY(`investigator_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_lineage` (
	`id` char(26) NOT NULL,
	`created_by` char(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_lineage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_note` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`campaign_id` char(26),
	`author_id` char(26) NOT NULL,
	`kind` enum('OWNER_PRIVATE','KEEPER','PLAYER_OBSERVATION') NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_note_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_note_disclosure` (
	`id` char(26) NOT NULL,
	`revision_id` char(26) NOT NULL,
	`viewer_id` char(26) NOT NULL,
	`disclosed_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_note_disclosure_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_note_disclosure` UNIQUE(`revision_id`,`viewer_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_note_revision` (
	`id` char(26) NOT NULL,
	`note_id` char(26) NOT NULL,
	`revision` smallint unsigned NOT NULL,
	`content` text NOT NULL,
	`visibility` enum('AUTHOR_ONLY','KEEPERS','KEEPERS_AND_OWNER','CAMPAIGN') NOT NULL,
	`created_by` char(26),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_note_revision_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_note_revision` UNIQUE(`note_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `investigator_possession` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`quantity` smallint unsigned NOT NULL DEFAULT 1,
	`value` decimal(15,2),
	`is_treasured` boolean NOT NULL DEFAULT false,
	`position` smallint unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_possession_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_profile` (
	`investigator_id` char(26) NOT NULL,
	`name` varchar(160),
	`age` tinyint unsigned,
	`sex` varchar(80),
	`residence` varchar(200),
	`birthplace` varchar(200),
	`species` varchar(80) NOT NULL DEFAULT 'Human',
	`occupation_id` varchar(100),
	`occupation_characteristic` char(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_profile_investigator_id` PRIMARY KEY(`investigator_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_resource_event` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`resource` enum('HP','SAN','MP','LUCK') NOT NULL,
	`previous_value` smallint NOT NULL,
	`current_value` smallint NOT NULL,
	`delta` smallint NOT NULL,
	`actor_id` char(26),
	`game_session_id` char(26),
	`reason` varchar(500),
	`reverses_event_id` char(26),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_resource_event_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_resource_event_reversal` UNIQUE(`reverses_event_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_skill` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`definition_id` varchar(100) NOT NULL,
	`family_id` varchar(100),
	`specialization_key` varchar(100) NOT NULL DEFAULT '',
	`specialization_label` varchar(160),
	`base_value` tinyint unsigned NOT NULL,
	`occupation_points` tinyint unsigned NOT NULL DEFAULT 0,
	`personal_interest_points` tinyint unsigned NOT NULL DEFAULT 0,
	`play_improvement` tinyint unsigned NOT NULL DEFAULT 0,
	`other_adjustment` smallint NOT NULL DEFAULT 0,
	`current_value` tinyint unsigned NOT NULL,
	`is_occupation_skill` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_skill_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_inv_skill_definition` UNIQUE(`investigator_id`,`definition_id`,`specialization_key`)
);
--> statement-breakpoint
CREATE TABLE `investigator_skill_development` (
	`id` char(26) NOT NULL,
	`investigator_skill_id` char(26) NOT NULL,
	`resolved_by` char(26),
	`percentile_roll` tinyint unsigned NOT NULL,
	`improvement_roll` tinyint unsigned,
	`previous_value` tinyint unsigned NOT NULL,
	`current_value` tinyint unsigned NOT NULL,
	`resolved_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_skill_development_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_skill_mark` (
	`id` char(26) NOT NULL,
	`investigator_skill_id` char(26) NOT NULL,
	`game_session_id` char(26),
	`development_id` char(26),
	`marked_by` char(26),
	`marked_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_skill_mark_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_skill_mark_session` UNIQUE(`investigator_skill_id`,`game_session_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_snapshot` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`kind` enum('SESSION_START','SESSION_END','TRANSFER','ACCESS_REDUCTION','MANUAL') NOT NULL,
	`campaign_id` char(26),
	`game_session_id` char(26),
	`schema_version` smallint unsigned NOT NULL,
	`state` json NOT NULL,
	`created_by` char(26),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_snapshot_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_state` (
	`investigator_id` char(26) NOT NULL,
	`hit_points` smallint,
	`sanity` smallint,
	`magic_points` smallint,
	`luck` smallint,
	`major_wound` boolean NOT NULL DEFAULT false,
	`temporary_insanity` boolean NOT NULL DEFAULT false,
	`indefinite_insanity` boolean NOT NULL DEFAULT false,
	`unconscious` boolean NOT NULL DEFAULT false,
	`dying` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_state_investigator_id` PRIMARY KEY(`investigator_id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_transfer` (
	`id` char(26) NOT NULL,
	`campaign_id` char(26) NOT NULL,
	`source_investigator_id` char(26) NOT NULL,
	`continuation_investigator_id` char(26),
	`from_owner_id` char(26) NOT NULL,
	`to_owner_id` char(26) NOT NULL,
	`requested_by` char(26),
	`status` enum('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`reason` varchar(500),
	`expires_at` datetime(3) NOT NULL,
	`decided_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_transfer_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investigator_weapon` (
	`id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`name` varchar(160) NOT NULL,
	`skill_key` varchar(160) NOT NULL,
	`damage` varchar(80) NOT NULL,
	`range` varchar(80),
	`attacks` varchar(80),
	`ammunition` smallint,
	`malfunction` tinyint unsigned,
	`notes` text,
	`position` smallint unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `investigator_weapon_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_investigator_assignment` (
	`id` char(26) NOT NULL,
	`session_participant_id` char(26) NOT NULL,
	`investigator_id` char(26) NOT NULL,
	`campaign_investigator_id` char(26) NOT NULL,
	`assigned_by` char(26),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `session_investigator_assignment_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_session_investigator_assignment` UNIQUE(`session_participant_id`)
);
--> statement-breakpoint
ALTER TABLE `game_session` MODIFY COLUMN `status` enum('DRAFT','COLLECTING','PROPOSED','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE `game_session` ADD `started_at` datetime(3);--> statement-breakpoint
ALTER TABLE `game_session` ADD `ended_at` datetime(3);--> statement-breakpoint
ALTER TABLE `session_participant` ADD `plays_investigator` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `campaign_investigator` ADD CONSTRAINT `campaign_investigator_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_investigator` ADD CONSTRAINT `campaign_investigator_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_investigator` ADD CONSTRAINT `campaign_investigator_linked_by_auth_user_id_fk` FOREIGN KEY (`linked_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator` ADD CONSTRAINT `investigator_lineage_id_investigator_lineage_id_fk` FOREIGN KEY (`lineage_id`) REFERENCES `investigator_lineage`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator` ADD CONSTRAINT `investigator_branched_from_id_investigator_id_fk` FOREIGN KEY (`branched_from_id`) REFERENCES `investigator`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator` ADD CONSTRAINT `investigator_owner_id_auth_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator` ADD CONSTRAINT `investigator_creator_id_auth_user_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator` ADD CONSTRAINT `investigator_creator_campaign_id_campaign_id_fk` FOREIGN KEY (`creator_campaign_id`) REFERENCES `campaign`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_access_grant` ADD CONSTRAINT `investigator_access_grant_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_access_grant` ADD CONSTRAINT `investigator_access_grant_viewer_id_auth_user_id_fk` FOREIGN KEY (`viewer_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_access_grant` ADD CONSTRAINT `investigator_access_grant_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_access_grant` ADD CONSTRAINT `fk_access_final_disclosure` FOREIGN KEY (`final_disclosure_snapshot_id`) REFERENCES `investigator_disclosure_snapshot`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_backstory_entry` ADD CONSTRAINT `investigator_backstory_entry_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_characteristic` ADD CONSTRAINT `investigator_characteristic_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_derived_override` ADD CONSTRAINT `investigator_derived_override_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_derived_override` ADD CONSTRAINT `investigator_derived_override_set_by_auth_user_id_fk` FOREIGN KEY (`set_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_disclosure_snapshot` ADD CONSTRAINT `investigator_disclosure_snapshot_viewer_id_auth_user_id_fk` FOREIGN KEY (`viewer_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_disclosure_snapshot` ADD CONSTRAINT `investigator_disclosure_snapshot_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_disclosure_snapshot` ADD CONSTRAINT `fk_disclosure_investigator` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_disclosure_snapshot` ADD CONSTRAINT `fk_disclosure_source_snapshot` FOREIGN KEY (`source_snapshot_id`) REFERENCES `investigator_snapshot`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_edit_grant` ADD CONSTRAINT `investigator_edit_grant_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_edit_grant` ADD CONSTRAINT `investigator_edit_grant_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_edit_grant` ADD CONSTRAINT `investigator_edit_grant_keeper_id_auth_user_id_fk` FOREIGN KEY (`keeper_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_field_visibility` ADD CONSTRAINT `investigator_field_visibility_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_field_visibility` ADD CONSTRAINT `investigator_field_visibility_updated_by_auth_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_finance` ADD CONSTRAINT `investigator_finance_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_lineage` ADD CONSTRAINT `investigator_lineage_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note` ADD CONSTRAINT `investigator_note_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note` ADD CONSTRAINT `investigator_note_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note` ADD CONSTRAINT `investigator_note_author_id_auth_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note_disclosure` ADD CONSTRAINT `investigator_note_disclosure_viewer_id_auth_user_id_fk` FOREIGN KEY (`viewer_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note_disclosure` ADD CONSTRAINT `fk_note_disclosure_revision` FOREIGN KEY (`revision_id`) REFERENCES `investigator_note_revision`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note_revision` ADD CONSTRAINT `investigator_note_revision_note_id_investigator_note_id_fk` FOREIGN KEY (`note_id`) REFERENCES `investigator_note`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note_revision` ADD CONSTRAINT `investigator_note_revision_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_possession` ADD CONSTRAINT `investigator_possession_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_profile` ADD CONSTRAINT `investigator_profile_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_resource_event` ADD CONSTRAINT `investigator_resource_event_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_resource_event` ADD CONSTRAINT `investigator_resource_event_actor_id_auth_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_resource_event` ADD CONSTRAINT `investigator_resource_event_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_resource_event` ADD CONSTRAINT `fk_resource_event_reversal` FOREIGN KEY (`reverses_event_id`) REFERENCES `investigator_resource_event`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill` ADD CONSTRAINT `investigator_skill_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill_development` ADD CONSTRAINT `investigator_skill_development_resolved_by_auth_user_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill_development` ADD CONSTRAINT `fk_skill_development_skill` FOREIGN KEY (`investigator_skill_id`) REFERENCES `investigator_skill`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill_mark` ADD CONSTRAINT `investigator_skill_mark_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill_mark` ADD CONSTRAINT `investigator_skill_mark_marked_by_auth_user_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill_mark` ADD CONSTRAINT `fk_skill_mark_skill` FOREIGN KEY (`investigator_skill_id`) REFERENCES `investigator_skill`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_skill_mark` ADD CONSTRAINT `fk_skill_mark_development` FOREIGN KEY (`development_id`) REFERENCES `investigator_skill_development`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_snapshot` ADD CONSTRAINT `investigator_snapshot_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_snapshot` ADD CONSTRAINT `investigator_snapshot_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_snapshot` ADD CONSTRAINT `investigator_snapshot_game_session_id_game_session_id_fk` FOREIGN KEY (`game_session_id`) REFERENCES `game_session`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_snapshot` ADD CONSTRAINT `investigator_snapshot_created_by_auth_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_state` ADD CONSTRAINT `investigator_state_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_transfer` ADD CONSTRAINT `investigator_transfer_campaign_id_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_transfer` ADD CONSTRAINT `investigator_transfer_source_investigator_id_investigator_id_fk` FOREIGN KEY (`source_investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_transfer` ADD CONSTRAINT `investigator_transfer_from_owner_id_auth_user_id_fk` FOREIGN KEY (`from_owner_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_transfer` ADD CONSTRAINT `investigator_transfer_to_owner_id_auth_user_id_fk` FOREIGN KEY (`to_owner_id`) REFERENCES `auth_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_transfer` ADD CONSTRAINT `investigator_transfer_requested_by_auth_user_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_transfer` ADD CONSTRAINT `fk_transfer_continuation` FOREIGN KEY (`continuation_investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_weapon` ADD CONSTRAINT `investigator_weapon_investigator_id_investigator_id_fk` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD CONSTRAINT `session_investigator_assignment_assigned_by_auth_user_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `auth_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD CONSTRAINT `fk_session_assignment_participant` FOREIGN KEY (`session_participant_id`) REFERENCES `session_participant`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD CONSTRAINT `fk_session_assignment_investigator` FOREIGN KEY (`investigator_id`) REFERENCES `investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD CONSTRAINT `fk_session_assignment_campaign_investigator` FOREIGN KEY (`campaign_investigator_id`) REFERENCES `campaign_investigator`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_campaign_investigator_active` ON `campaign_investigator` (`campaign_id`,`unlinked_at`);--> statement-breakpoint
CREATE INDEX `ix_investigator_campaign_active` ON `campaign_investigator` (`investigator_id`,`unlinked_at`);--> statement-breakpoint
CREATE INDEX `ix_investigator_owner` ON `investigator` (`owner_id`,`archived_at`,`status`);--> statement-breakpoint
CREATE INDEX `ix_investigator_lineage` ON `investigator` (`lineage_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_investigator_creator_campaign` ON `investigator` (`creator_campaign_id`,`creator_id`);--> statement-breakpoint
CREATE INDEX `ix_access_viewer_active` ON `investigator_access_grant` (`viewer_id`,`ended_at`,`level`);--> statement-breakpoint
CREATE INDEX `ix_access_investigator_active` ON `investigator_access_grant` (`investigator_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `ix_backstory_investigator` ON `investigator_backstory_entry` (`investigator_id`,`category`,`position`);--> statement-breakpoint
CREATE INDEX `ix_derived_override_active` ON `investigator_derived_override` (`investigator_id`,`field_key`,`ended_at`);--> statement-breakpoint
CREATE INDEX `ix_disclosure_viewer` ON `investigator_disclosure_snapshot` (`viewer_id`,`investigator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_disclosure_campaign` ON `investigator_disclosure_snapshot` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_edit_grant_keeper` ON `investigator_edit_grant` (`keeper_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `ix_note_investigator` ON `investigator_note` (`investigator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_note_author` ON `investigator_note` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_possession_investigator` ON `investigator_possession` (`investigator_id`,`position`);--> statement-breakpoint
CREATE INDEX `ix_resource_event_investigator` ON `investigator_resource_event` (`investigator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_inv_skill_investigator_value` ON `investigator_skill` (`investigator_id`,`current_value`);--> statement-breakpoint
CREATE INDEX `ix_skill_development_skill` ON `investigator_skill_development` (`investigator_skill_id`,`resolved_at`);--> statement-breakpoint
CREATE INDEX `ix_skill_mark_pending` ON `investigator_skill_mark` (`investigator_skill_id`,`development_id`);--> statement-breakpoint
CREATE INDEX `ix_snapshot_investigator` ON `investigator_snapshot` (`investigator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_snapshot_session` ON `investigator_snapshot` (`game_session_id`,`kind`);--> statement-breakpoint
CREATE INDEX `ix_transfer_owner_pending` ON `investigator_transfer` (`from_owner_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_transfer_campaign` ON `investigator_transfer` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_weapon_investigator` ON `investigator_weapon` (`investigator_id`,`position`);--> statement-breakpoint
CREATE INDEX `ix_assignment_investigator` ON `session_investigator_assignment` (`investigator_id`);--> statement-breakpoint
ALTER TABLE `notification` MODIFY COLUMN `type` enum('CAMPAIGN_INVITED','CAMPAIGN_MEMBER_JOINED','SESSION_CREATED','AVAILABILITY_REQUESTED','AVAILABILITY_REMINDER','COLLECTION_CLOSED','SESSION_SCHEDULED','SESSION_RESCHEDULED','SESSION_CANCELLED','NO_NEXT_SESSION','ISSUE_REPORTED','INVESTIGATOR_CREATED_FOR_YOU','INVESTIGATOR_LINKED','INVESTIGATOR_REQUESTED','INVESTIGATOR_EDIT_GRANT_CLOSED','INVESTIGATOR_TRANSFER_REQUESTED','INVESTIGATOR_TRANSFER_ACCEPTED','INVESTIGATOR_TRANSFER_REJECTED','INVESTIGATOR_TRANSFER_EXPIRED','SESSION_ASSIGNMENT_CHANGED','SESSION_ASSIGNMENT_MISSING') NOT NULL;--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD `start_snapshot_id` char(26);--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD `end_snapshot_id` char(26);--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD CONSTRAINT `fk_assignment_start_snapshot` FOREIGN KEY (`start_snapshot_id`) REFERENCES `investigator_snapshot`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_investigator_assignment` ADD CONSTRAINT `fk_assignment_end_snapshot` FOREIGN KEY (`end_snapshot_id`) REFERENCES `investigator_snapshot`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_note` ADD `disclosure_snapshot_id` char(26);--> statement-breakpoint
ALTER TABLE `investigator_note` ADD CONSTRAINT `fk_note_disclosure_snapshot` FOREIGN KEY (`disclosure_snapshot_id`) REFERENCES `investigator_disclosure_snapshot`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `investigator_profile` ADD `occupation_contact` varchar(300);

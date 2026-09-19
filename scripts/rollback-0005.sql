-- Reverses 0005_investigator_management.
--
-- For the release-gate rollback in section 2 of the investigator plan: the
-- migration is additive, so an older application runs against the migrated
-- schema unharmed, and this script is only for putting the database back the
-- way it was once that has been decided.
--
-- It discards every Investigator, note, snapshot and disclosure. Take a dump
-- first (scripts/backup.sh predeploy) and be certain the decision is to abandon
-- the feature rather than to fix it forward.
--
-- Run: docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" arkham < scripts/rollback-0005.sql

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `session_investigator_assignment`;
DROP TABLE IF EXISTS `investigator_note_disclosure`;
DROP TABLE IF EXISTS `investigator_note_revision`;
DROP TABLE IF EXISTS `investigator_note`;
DROP TABLE IF EXISTS `investigator_transfer`;
DROP TABLE IF EXISTS `investigator_disclosure_snapshot`;
DROP TABLE IF EXISTS `investigator_snapshot`;
DROP TABLE IF EXISTS `investigator_access_grant`;
DROP TABLE IF EXISTS `investigator_edit_grant`;
DROP TABLE IF EXISTS `investigator_field_visibility`;
DROP TABLE IF EXISTS `investigator_derived_override`;
DROP TABLE IF EXISTS `investigator_resource_event`;
DROP TABLE IF EXISTS `investigator_skill_mark`;
DROP TABLE IF EXISTS `investigator_skill_development`;
DROP TABLE IF EXISTS `investigator_skill`;
DROP TABLE IF EXISTS `investigator_possession`;
DROP TABLE IF EXISTS `investigator_weapon`;
DROP TABLE IF EXISTS `investigator_backstory_entry`;
DROP TABLE IF EXISTS `investigator_finance`;
DROP TABLE IF EXISTS `investigator_state`;
DROP TABLE IF EXISTS `investigator_characteristic`;
DROP TABLE IF EXISTS `investigator_profile`;
DROP TABLE IF EXISTS `campaign_investigator`;
DROP TABLE IF EXISTS `investigator`;
DROP TABLE IF EXISTS `investigator_lineage`;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `session_participant` DROP COLUMN `plays_investigator`;
ALTER TABLE `game_session` DROP COLUMN `started_at`;
ALTER TABLE `game_session` DROP COLUMN `ended_at`;

-- A session that was being played has no state to go back to in the old enum.
-- SCHEDULED is the honest one: it was arranged and it is not finished.
UPDATE `game_session` SET `status` = 'SCHEDULED' WHERE `status` = 'IN_PROGRESS';

ALTER TABLE `game_session` MODIFY COLUMN `status` enum('DRAFT','COLLECTING','PROPOSED','SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT';

-- Narrowing the notification enum with rows still using the new values would
-- turn them into empty strings, so they go first - deliveries before the
-- notifications they belong to.
DELETE FROM `notification_delivery` WHERE `notification_id` IN (
  SELECT `id` FROM `notification` WHERE `type` IN (
    'INVESTIGATOR_CREATED_FOR_YOU','INVESTIGATOR_LINKED','INVESTIGATOR_REQUESTED',
    'INVESTIGATOR_EDIT_GRANT_CLOSED','INVESTIGATOR_TRANSFER_REQUESTED',
    'INVESTIGATOR_TRANSFER_ACCEPTED','INVESTIGATOR_TRANSFER_REJECTED',
    'INVESTIGATOR_TRANSFER_EXPIRED','SESSION_ASSIGNMENT_CHANGED','SESSION_ASSIGNMENT_MISSING'
  )
);

DELETE FROM `notification` WHERE `type` IN (
  'INVESTIGATOR_CREATED_FOR_YOU','INVESTIGATOR_LINKED','INVESTIGATOR_REQUESTED',
  'INVESTIGATOR_EDIT_GRANT_CLOSED','INVESTIGATOR_TRANSFER_REQUESTED',
  'INVESTIGATOR_TRANSFER_ACCEPTED','INVESTIGATOR_TRANSFER_REJECTED',
  'INVESTIGATOR_TRANSFER_EXPIRED','SESSION_ASSIGNMENT_CHANGED','SESSION_ASSIGNMENT_MISSING'
);

ALTER TABLE `notification` MODIFY COLUMN `type` enum('CAMPAIGN_INVITED','CAMPAIGN_MEMBER_JOINED','SESSION_CREATED','AVAILABILITY_REQUESTED','AVAILABILITY_REMINDER','COLLECTION_CLOSED','SESSION_SCHEDULED','SESSION_RESCHEDULED','SESSION_CANCELLED','NO_NEXT_SESSION','ISSUE_REPORTED') NOT NULL;

-- Drizzle tracks what it has applied by timestamp. Without this the migration
-- is considered done and will not run again.
DELETE FROM `__drizzle_migrations` WHERE `created_at` = 1789761366605;

CREATE UNIQUE INDEX `invite_personal_uq` ON `invite_codes` (`created_by`) WHERE kind = 'personal';

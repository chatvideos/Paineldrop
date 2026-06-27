CREATE TABLE `apk_jobs` (
	`id` varchar(64) NOT NULL,
	`original_name` varchar(512) NOT NULL,
	`status` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`log_text` text,
	`original_key` varchar(512),
	`modified_key` varchar(512),
	`modified_url` text,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apk_jobs_id` PRIMARY KEY(`id`)
);

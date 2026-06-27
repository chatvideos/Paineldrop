CREATE TABLE `dropper_jobs` (
	`id` varchar(64) NOT NULL,
	`app_name` varchar(256) NOT NULL,
	`package_name` varchar(256),
	`payload_name` varchar(512) NOT NULL,
	`status` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`log_text` text,
	`payload_key` varchar(512),
	`icon_key` varchar(512),
	`dropper_key` varchar(512),
	`dropper_url` text,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dropper_jobs_id` PRIMARY KEY(`id`)
);

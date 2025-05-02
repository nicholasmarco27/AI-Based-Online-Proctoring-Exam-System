USE capstone;
CREATE TABLE `user` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(80) NOT NULL,
  `password_hash` VARCHAR(256) NOT NULL,
  `role` VARCHAR(7) NOT NULL COMMENT 'Consider ENUM if roles are fixed',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: user_group
CREATE TABLE `user_group` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_group_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: exam
CREATE TABLE `exam` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `subject` VARCHAR(100) DEFAULT NULL,
  `duration` INT NOT NULL COMMENT 'Specify units, e.g., minutes',
  `status` VARCHAR(9) NOT NULL COMMENT 'Consider ENUM (e.g., draft, published, archived)',
  `allowed_attempts` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: user_group_membership (Many-to-Many relationship between user and user_group)
CREATE TABLE `user_group_membership` (
  `user_id` INT NOT NULL,
  `group_id` INT NOT NULL,
  PRIMARY KEY (`user_id`, `group_id`),
  CONSTRAINT `fk_membership_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_membership_group`
    FOREIGN KEY (`group_id`)
    REFERENCES `user_group` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: exam_group_assignment (Many-to-Many relationship between exam and user_group)
CREATE TABLE `exam_group_assignment` (
  `exam_id` INT NOT NULL,
  `group_id` INT NOT NULL,
  PRIMARY KEY (`exam_id`, `group_id`),
  CONSTRAINT `fk_assignment_exam`
    FOREIGN KEY (`exam_id`)
    REFERENCES `exam` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_group`
    FOREIGN KEY (`group_id`)
    REFERENCES `user_group` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: notification_log
CREATE TABLE `notification_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `type` VARCHAR(25) NOT NULL,
  `message` TEXT NOT NULL, -- Using TEXT as original VARCHAR had no length
  `user_id` INT DEFAULT NULL,
  `exam_id` INT DEFAULT NULL,
  `details` JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_notif_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`)
    ON DELETE SET NULL -- Keep log if user deleted, set user_id to NULL (Review if CASCADE is preferred)
    ON UPDATE CASCADE,
  CONSTRAINT `fk_notif_exam`
    FOREIGN KEY (`exam_id`)
    REFERENCES `exam` (`id`)
    ON DELETE SET NULL -- Keep log if exam deleted, set exam_id to NULL (Review if CASCADE is preferred)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: question
CREATE TABLE `question` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `exam_id` INT NOT NULL,
  `text` TEXT NOT NULL,
  `options_json` JSON NOT NULL COMMENT 'Storing options as native JSON',
  `correct_answer` TEXT NOT NULL, -- Using TEXT, assuming answers might be long
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_question_exam`
    FOREIGN KEY (`exam_id`)
    REFERENCES `exam` (`id`)
    ON DELETE CASCADE -- If exam is deleted, delete its questions
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: exam_submission
CREATE TABLE `exam_submission` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `exam_id` INT NOT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `score` FLOAT DEFAULT NULL,
  `correct_answers_count` INT DEFAULT NULL,
  `total_questions_count` INT NOT NULL,
  `answers` JSON DEFAULT NULL COMMENT 'Storing answers as native JSON',
  `status` VARCHAR(20) NOT NULL DEFAULT 'Completed' COMMENT 'Consider ENUM (e.g., InProgress, Completed, Graded)',
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_submission_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `user` (`id`)
    ON DELETE CASCADE -- If user deleted, delete their submissions (Review this!)
    ON UPDATE CASCADE,
  CONSTRAINT `fk_submission_exam`
    FOREIGN KEY (`exam_id`)
    REFERENCES `exam` (`id`)
    ON DELETE CASCADE -- If exam deleted, delete its submissions
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes (Syntax adapted for MySQL)
CREATE INDEX `ix_exam_submission_exam_id` ON `exam_submission` (`exam_id`);
CREATE INDEX `ix_exam_submission_user_id` ON `exam_submission` (`user_id`);
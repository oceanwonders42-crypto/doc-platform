-- Make RecordsRequestAttempt.destination optional
ALTER TABLE "RecordsRequestAttempt" ALTER COLUMN "destination" DROP NOT NULL;

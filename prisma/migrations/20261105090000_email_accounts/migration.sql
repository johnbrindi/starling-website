-- Accounts sign in with email; phone becomes optional (older accounts keep theirs)
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL;

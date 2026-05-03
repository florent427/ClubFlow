-- CourseSlot booking fields
ALTER TABLE "CourseSlot"
  ADD COLUMN "bookingEnabled"  BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "bookingCapacity" INTEGER,
  ADD COLUMN "bookingOpensAt"  TIMESTAMP(3),
  ADD COLUMN "bookingClosesAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "CourseSlotBookingStatus" AS ENUM ('BOOKED', 'WAITLISTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CourseSlotBooking" (
    "id" TEXT NOT NULL,
    "courseSlotId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "CourseSlotBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSlotBooking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseSlotBooking_courseSlotId_memberId_key"
  ON "CourseSlotBooking"("courseSlotId", "memberId");
CREATE INDEX "CourseSlotBooking_courseSlotId_idx" ON "CourseSlotBooking"("courseSlotId");
CREATE INDEX "CourseSlotBooking_memberId_idx" ON "CourseSlotBooking"("memberId");

ALTER TABLE "CourseSlotBooking"
  ADD CONSTRAINT "CourseSlotBooking_courseSlotId_fkey"
  FOREIGN KEY ("courseSlotId") REFERENCES "CourseSlot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseSlotBooking"
  ADD CONSTRAINT "CourseSlotBooking_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

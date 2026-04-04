-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSlot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "coachMemberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "dynamicGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Venue_clubId_idx" ON "Venue"("clubId");

-- CreateIndex
CREATE INDEX "CourseSlot_clubId_coachMemberId_idx" ON "CourseSlot"("clubId", "coachMemberId");

-- CreateIndex
CREATE INDEX "CourseSlot_clubId_startsAt_idx" ON "CourseSlot"("clubId", "startsAt");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSlot" ADD CONSTRAINT "CourseSlot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSlot" ADD CONSTRAINT "CourseSlot_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSlot" ADD CONSTRAINT "CourseSlot_coachMemberId_fkey" FOREIGN KEY ("coachMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSlot" ADD CONSTRAINT "CourseSlot_dynamicGroupId_fkey" FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

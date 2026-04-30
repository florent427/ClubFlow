-- Module DOCUMENTS : signature électronique de PDFs (règlement intérieur, etc.)

-- Enums
CREATE TYPE "ClubDocumentCategory" AS ENUM (
  'REGLEMENT_INTERIEUR',
  'AUTORISATION_PARENTALE',
  'DROIT_IMAGE',
  'REGLEMENT_FEDERAL',
  'AUTRE'
);

CREATE TYPE "ClubDocumentFieldType" AS ENUM (
  'SIGNATURE',
  'TEXT',
  'DATE',
  'CHECKBOX'
);

-- ClubDocument : un document à signer (versionnable)
CREATE TABLE "ClubDocument" (
  "id"           TEXT NOT NULL,
  "clubId"       TEXT NOT NULL,
  "category"     "ClubDocumentCategory" NOT NULL DEFAULT 'AUTRE',
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "mediaAssetId" TEXT NOT NULL,
  "version"      INTEGER NOT NULL DEFAULT 1,
  "fileSha256"   TEXT NOT NULL,
  "isRequired"   BOOLEAN NOT NULL DEFAULT true,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "validFrom"    TIMESTAMP(3) NOT NULL,
  "validTo"      TIMESTAMP(3),
  "minorsOnly"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClubDocument_clubId_isActive_isRequired_idx"
  ON "ClubDocument"("clubId", "isActive", "isRequired");
CREATE INDEX "ClubDocument_clubId_category_idx"
  ON "ClubDocument"("clubId", "category");

ALTER TABLE "ClubDocument"
  ADD CONSTRAINT "ClubDocument_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubDocument"
  ADD CONSTRAINT "ClubDocument_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ClubDocumentField : zones positionnées sur le PDF (signature, texte, date, case)
CREATE TABLE "ClubDocumentField" (
  "id"         TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "page"       INTEGER NOT NULL,
  "x"          DOUBLE PRECISION NOT NULL,
  "y"          DOUBLE PRECISION NOT NULL,
  "width"      DOUBLE PRECISION NOT NULL,
  "height"     DOUBLE PRECISION NOT NULL,
  "fieldType"  "ClubDocumentFieldType" NOT NULL,
  "required"   BOOLEAN NOT NULL DEFAULT true,
  "label"      TEXT,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ClubDocumentField_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClubDocumentField_documentId_idx"
  ON "ClubDocumentField"("documentId");

ALTER TABLE "ClubDocumentField"
  ADD CONSTRAINT "ClubDocumentField_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ClubDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ClubSignedDocument : snapshot d'une signature (PDF rendu + audit trail)
CREATE TABLE "ClubSignedDocument" (
  "id"               TEXT NOT NULL,
  "clubId"           TEXT NOT NULL,
  "documentId"       TEXT NOT NULL,
  "version"          INTEGER NOT NULL,
  "userId"           TEXT NOT NULL,
  "memberId"         TEXT,
  "signedAssetId"    TEXT NOT NULL,
  "signedSha256"     TEXT NOT NULL,
  "sourceSha256"     TEXT NOT NULL,
  "ipAddress"        TEXT,
  "userAgent"        TEXT,
  "fieldValuesJson"  JSONB NOT NULL,
  "signedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidatedAt"    TIMESTAMP(3),
  CONSTRAINT "ClubSignedDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubSignedDocument_documentId_version_userId_memberId_key"
  ON "ClubSignedDocument"("documentId", "version", "userId", "memberId");
CREATE INDEX "ClubSignedDocument_clubId_signedAt_idx"
  ON "ClubSignedDocument"("clubId", "signedAt");
CREATE INDEX "ClubSignedDocument_userId_idx"
  ON "ClubSignedDocument"("userId");
CREATE INDEX "ClubSignedDocument_memberId_idx"
  ON "ClubSignedDocument"("memberId");

ALTER TABLE "ClubSignedDocument"
  ADD CONSTRAINT "ClubSignedDocument_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubSignedDocument"
  ADD CONSTRAINT "ClubSignedDocument_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ClubDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubSignedDocument"
  ADD CONSTRAINT "ClubSignedDocument_signedAssetId_fkey"
  FOREIGN KEY ("signedAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

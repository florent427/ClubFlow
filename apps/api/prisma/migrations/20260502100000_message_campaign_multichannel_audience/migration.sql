-- Refonte Campagnes : multi-canal (Email + Push + Messagerie interne)
-- + audience riche (groupes dynamiques + rôles + age + membres individuels).
--
-- Backward-compat :
--  - `channel` (single, legacy) reste rempli pour les anciennes campagnes
--    et continue d'être utilisé si `channels[]` est vide
--  - `dynamicGroupId` (single, legacy) reste utilisé si `audienceFilterJson`
--    est null

ALTER TABLE "MessageCampaign"
  ADD COLUMN "channels"            "CommunicationChannel"[] DEFAULT ARRAY[]::"CommunicationChannel"[],
  ADD COLUMN "audienceFilterJson"  JSONB;

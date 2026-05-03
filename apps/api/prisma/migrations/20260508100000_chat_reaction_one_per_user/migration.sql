-- Migration : enforce **1 réaction emoji par membre par message**.
--
-- Avant : `@@unique([messageId, memberId, emoji])` autorisait un user à
-- empiler plusieurs emojis sur un même message (👍 + ❤️ + 😂 simultanés).
-- Maintenant : `@@unique([messageId, memberId])` ne tolère qu'une seule
-- réaction par user. Le service `toggleReaction` UPDATE quand le user
-- clique un nouvel emoji, ou DELETE quand il re-clique le même.
--
-- Étape 1 : nettoyer les données — pour chaque (messageId, memberId), on
-- ne garde QUE la réaction la plus récente. Les doublons sont supprimés.
-- Sans ce nettoyage, la création de la nouvelle contrainte UNIQUE
-- échouerait sur un dataset existant qui contient des multiples.
DELETE FROM "ChatMessageReaction" r1
USING "ChatMessageReaction" r2
WHERE r1."messageId" = r2."messageId"
  AND r1."memberId" = r2."memberId"
  AND r1."createdAt" < r2."createdAt";

-- Étape 2 : remplacer la contrainte unique.
ALTER TABLE "ChatMessageReaction"
  DROP CONSTRAINT IF EXISTS "ChatMessageReaction_messageId_memberId_emoji_key";

ALTER TABLE "ChatMessageReaction"
  ADD CONSTRAINT "ChatMessageReaction_messageId_memberId_key"
  UNIQUE ("messageId", "memberId");

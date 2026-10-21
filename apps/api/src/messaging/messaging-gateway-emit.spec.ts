import { MediaUrlSignerService } from '../media/media-url-signer.service';
import { MessagingGateway } from './messaging.gateway';

/**
 * Un message poussé en temps réel ne traverse aucun modèle GraphQL : le
 * middleware de champ qui signe les URL média ne le voit pas. Les pièces
 * jointes, privées, doivent donc être signées à l'émission — sinon l'`<Image>`
 * du destinataire reçoit « Asset introuvable » jusqu'au prochain rechargement.
 */
const ASSET_ID = '0b5e3a52-6f1c-4d8e-9a27-3c4b5d6e7f80';
const THUMB_ID = '1c6f4b63-7a2d-4e9f-8b38-4d5c6e7f8091';
const url = (id: string) => `https://api.example.test/media/${id}`;

function signee(value: unknown, assetId: string): boolean {
  const s = String(value);
  if (!s.startsWith(`${url(assetId)}?`)) return false;
  const params = new URL(s).searchParams;
  return new MediaUrlSignerService().verify(
    assetId,
    params.get('exp') ?? undefined,
    params.get('sig') ?? undefined,
  );
}

describe('MessagingGateway.emitChatMessage — URL média signées', () => {
  it('signe l’avatar, le fichier et la vignette de chaque pièce jointe', () => {
    const emit = jest.fn();
    const gateway = new MessagingGateway(
      {} as never,
      {} as never,
      new MediaUrlSignerService(),
      {} as never,
    );
    gateway.server = {
      to: jest.fn(() => ({ emit })),
    } as unknown as MessagingGateway['server'];

    gateway.emitChatMessage('salon-1', {
      id: 'm1',
      roomId: 'salon-1',
      body: null,
      createdAt: new Date(),
      parentMessageId: null,
      sender: {
        id: 's1',
        pseudo: null,
        firstName: 'A',
        lastName: 'B',
        photoUrl: url(ASSET_ID),
      },
      attachments: [
        {
          id: 'a1',
          kind: 'IMAGE',
          mediaUrl: url(ASSET_ID),
          thumbnailUrl: url(THUMB_ID),
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
          durationMs: null,
        },
      ],
    });

    const sent = emit.mock.calls[0][1] as {
      sender: { photoUrl: string };
      attachments: Array<{ mediaUrl: string; thumbnailUrl: string }>;
    };
    expect(signee(sent.sender.photoUrl, ASSET_ID)).toBe(true);
    expect(signee(sent.attachments[0].mediaUrl, ASSET_ID)).toBe(true);
    expect(signee(sent.attachments[0].thumbnailUrl, THUMB_ID)).toBe(true);
  });
});

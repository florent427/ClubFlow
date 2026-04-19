import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ViewerIdentity = {
  memberId?: string | null;
  contactId?: string | null;
};

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Products ---

  async listProductsAdmin(clubId: string) {
    return this.prisma.shopProduct.findMany({
      where: { clubId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listProductsPublic(clubId: string) {
    return this.prisma.shopProduct.findMany({
      where: { clubId, active: true },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async createProduct(
    clubId: string,
    input: {
      name: string;
      sku?: string;
      description?: string;
      imageUrl?: string;
      priceCents: number;
      stock?: number;
      active?: boolean;
    },
  ) {
    return this.prisma.shopProduct.create({
      data: {
        clubId,
        name: input.name,
        sku: input.sku ?? null,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        priceCents: input.priceCents,
        stock: input.stock ?? null,
        active: input.active !== false,
      },
    });
  }

  async updateProduct(
    clubId: string,
    id: string,
    input: {
      name?: string;
      sku?: string;
      description?: string;
      imageUrl?: string;
      priceCents?: number;
      stock?: number;
      active?: boolean;
    },
  ) {
    const existing = await this.prisma.shopProduct.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Produit introuvable');
    const data: Prisma.ShopProductUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.description !== undefined) data.description = input.description;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.priceCents !== undefined) data.priceCents = input.priceCents;
    if (input.stock !== undefined) data.stock = input.stock;
    if (input.active !== undefined) data.active = input.active;
    return this.prisma.shopProduct.update({ where: { id }, data });
  }

  async deleteProduct(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.shopProduct.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    const used = await this.prisma.shopOrderLine.count({
      where: { productId: id },
    });
    if (used > 0) {
      await this.prisma.shopProduct.update({
        where: { id },
        data: { active: false },
      });
      return true;
    }
    await this.prisma.shopProduct.delete({ where: { id } });
    return true;
  }

  // --- Orders ---

  async listOrdersAdmin(clubId: string) {
    const rows = await this.prisma.shopOrder.findMany({
      where: { clubId },
      orderBy: [{ createdAt: 'desc' }],
      include: { lines: true },
    });
    return this.hydrateBuyers(rows);
  }

  async listOrdersForViewer(clubId: string, viewer: ViewerIdentity) {
    if (!viewer.memberId && !viewer.contactId) return [];
    const rows = await this.prisma.shopOrder.findMany({
      where: {
        clubId,
        ...(viewer.memberId
          ? { memberId: viewer.memberId }
          : { contactId: viewer.contactId }),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: { lines: true },
    });
    return this.hydrateBuyers(rows);
  }

  async placeOrder(
    clubId: string,
    viewer: ViewerIdentity,
    input: {
      lines: Array<{ productId: string; quantity: number }>;
      note?: string;
    },
  ) {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis pour commander.');
    }
    if (input.lines.length === 0) {
      throw new BadRequestException('Commande vide.');
    }
    const productIds = Array.from(new Set(input.lines.map((l) => l.productId)));
    const products = await this.prisma.shopProduct.findMany({
      where: { id: { in: productIds }, clubId, active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const line of input.lines) {
      const p = byId.get(line.productId);
      if (!p) {
        throw new BadRequestException('Produit indisponible.');
      }
      if (line.quantity < 1) {
        throw new BadRequestException('Quantité invalide.');
      }
      if (p.stock !== null && p.stock < line.quantity) {
        throw new BadRequestException(
          `Stock insuffisant pour « ${p.name} » (${p.stock} restant).`,
        );
      }
    }

    const totalCents = input.lines.reduce((sum, l) => {
      const p = byId.get(l.productId);
      return sum + (p ? p.priceCents * l.quantity : 0);
    }, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shopOrder.create({
        data: {
          clubId,
          memberId: viewer.memberId ?? null,
          contactId: viewer.memberId ? null : viewer.contactId ?? null,
          status: ShopOrderStatus.PENDING,
          totalCents,
          note: input.note ?? null,
          lines: {
            create: input.lines.map((l) => {
              const p = byId.get(l.productId)!;
              return {
                productId: p.id,
                quantity: l.quantity,
                unitPriceCents: p.priceCents,
                label: p.name,
              };
            }),
          },
        },
        include: { lines: true },
      });
      for (const l of input.lines) {
        const p = byId.get(l.productId)!;
        if (p.stock !== null) {
          await tx.shopProduct.update({
            where: { id: p.id },
            data: { stock: { decrement: l.quantity } },
          });
        }
      }
      return created;
    });

    return (await this.hydrateBuyers([order]))[0];
  }

  async markOrderPaid(clubId: string, orderId: string) {
    const existing = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Commande introuvable');
    const updated = await this.prisma.shopOrder.update({
      where: { id: orderId },
      data: {
        status: ShopOrderStatus.PAID,
        paidAt: existing.paidAt ?? new Date(),
      },
      include: { lines: true },
    });
    return (await this.hydrateBuyers([updated]))[0];
  }

  async cancelOrder(clubId: string, orderId: string) {
    const existing = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Commande introuvable');
    if (existing.status === ShopOrderStatus.CANCELLED) {
      return (await this.hydrateBuyers([existing]))[0];
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.shopOrder.update({
        where: { id: orderId },
        data: { status: ShopOrderStatus.CANCELLED },
        include: { lines: true },
      });
      for (const l of existing.lines) {
        await tx.shopProduct.updateMany({
          where: { id: l.productId, stock: { not: null } },
          data: { stock: { increment: l.quantity } },
        });
      }
      return row;
    });
    return (await this.hydrateBuyers([updated]))[0];
  }

  private async hydrateBuyers(
    orders: Array<
      Prisma.ShopOrderGetPayload<{ include: { lines: true } }>
    >,
  ) {
    const memberIds = Array.from(
      new Set(orders.map((o) => o.memberId).filter((v): v is string => !!v)),
    );
    const contactIds = Array.from(
      new Set(orders.map((o) => o.contactId).filter((v): v is string => !!v)),
    );
    const [members, contacts] = await Promise.all([
      memberIds.length > 0
        ? this.prisma.member.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      contactIds.length > 0
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const contactById = new Map(contacts.map((c) => [c.id, c]));
    return orders.map((o) => {
      let first: string | null = null;
      let last: string | null = null;
      if (o.memberId && memberById.has(o.memberId)) {
        const m = memberById.get(o.memberId)!;
        first = m.firstName;
        last = m.lastName;
      } else if (o.contactId && contactById.has(o.contactId)) {
        const c = contactById.get(o.contactId)!;
        first = c.firstName;
        last = c.lastName;
      }
      return {
        id: o.id,
        clubId: o.clubId,
        memberId: o.memberId,
        contactId: o.contactId,
        status: o.status,
        totalCents: o.totalCents,
        note: o.note,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        paidAt: o.paidAt,
        lines: o.lines.map((l) => ({
          id: l.id,
          orderId: l.orderId,
          productId: l.productId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          label: l.label,
        })),
        buyerFirstName: first,
        buyerLastName: last,
      };
    });
  }
}

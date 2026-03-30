import { ModuleRegistryService } from './module-registry.service';
import { ModuleCode } from './module-codes';

describe('ModuleRegistryService', () => {
  const svc = new ModuleRegistryService();

  it('rejette l’activation de BLOG sans WEBSITE', () => {
    const enabled = new Set<ModuleCode>([ModuleCode.MEMBERS]);
    expect(() =>
      svc.assertCanEnable(ModuleCode.BLOG, enabled),
    ).toThrow(/WEBSITE/);
  });

  it('autorise BLOG lorsque WEBSITE est actif', () => {
    const enabled = new Set<ModuleCode>([ModuleCode.MEMBERS, ModuleCode.WEBSITE]);
    expect(() => svc.assertCanEnable(ModuleCode.BLOG, enabled)).not.toThrow();
  });

  it('rejette SHOP sans WEBSITE ou sans PAYMENT', () => {
    expect(() =>
      svc.assertCanEnable(
        ModuleCode.SHOP,
        new Set([ModuleCode.MEMBERS, ModuleCode.PAYMENT]),
      ),
    ).toThrow(/WEBSITE/);
    expect(() =>
      svc.assertCanEnable(
        ModuleCode.SHOP,
        new Set([ModuleCode.MEMBERS, ModuleCode.WEBSITE]),
      ),
    ).toThrow(/PAYMENT/);
  });
});

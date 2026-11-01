/**
 * Repositories — 领域概念到 EADAF routePath 的适配层
 *
 * 业务编排路由 (op.routes.ts) 通过 repo 操作领域数据，repo 内部调用 EADAFClient。
 * 命名约定：实体字段 camelCase（scheduling 模块例外）。
 */
import { eadafClient } from './EADAFClient.js';
import { EADAF_ROUTES } from '@ips/shared';
import type {
  FindResult,
  WorkshopOrder,
  WbsNode,
  WorkCard,
  WorkCardTask,
  SingleUnitPlan,
  BopInstance,
  WorkCardKitRequirement,
  WorkCardPlanSlot,
  Workstation,
  Product,
  Material,
  ProcessOperation,
  ProcessStep,
  ProcessStepEdge,
  ProcessOperationMaterial,
  BopScheme,
  BopOperationNode,
  BopOperationEdge,
  BomScheme,
  BomSchemeNode,
  InspectionItem,
  OperationInstance,
  StepInstance,
  WorkCardOutsourcing,
  WorkCardEdge,
  FactoryOrder,
  ScheduleConfig,
  WorkstationCapacity,
  WorkHourMedian,
  AlertRecord,
} from '@ips/shared';

const R = EADAF_ROUTES;

/**
 * 按 id 取单条记录。
 *
 * EADAF Find 的服务端过滤不支持 `id` 字段（实测 ?id=xxx 被忽略，返回全部），
 * 故先按关联字段拉一页再在本地精确匹配 id；匹配不到回退按业务 code 字段匹配。
 */
async function findItemById<T extends { id?: string }>(
  routePath: string,
  id: string,
  filter: Record<string, unknown>,
  codeField?: string,
): Promise<T | null> {
  const res = await eadafClient.find<T>(routePath, { filter: { ...filter }, limit: 100 });
  const byId = res.items.find((it) => it.id === id);
  if (byId) return byId;
  if (codeField) {
    const byCode = res.items.find((it) => (it as Record<string, unknown>)[codeField] === id);
    if (byCode) return byCode;
  }
  return null;
}

// ============ 工位 ============
export const workstationRepo = {
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<Workstation>(R.workstation, filter)
      : eadafClient.find<Workstation>(R.workstation),
  getByStationNo: async (stationNo: string) => {
    const res = await eadafClient.findFiltered<Workstation>(R.workstation, { stationNo });
    return res.items[0] ?? null;
  },
  get: async (id: string) => findItemById<Workstation>(R.workstation, id, {}, 'stationNo'),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<Workstation>(R.workstation, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<Workstation>(R.workstation, id, body),
};

// ============ 产品 / 物料 ============
export const productRepo = {
  list: () => eadafClient.find<Product>(R.product),
  get: async (id: string) => findItemById<Product>(R.product, id, {}, 'productNo'),
  getByProductNo: async (productNo: string) => {
    const res = await eadafClient.findFiltered<Product>(R.product, { productNo });
    return res.items[0] ?? null;
  },
  create: (body: Record<string, unknown>) => eadafClient.create<Product>(R.product, body),
};

export const materialRepo = {
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<Material>(R.material, filter)
      : eadafClient.find<Material>(R.material),
  get: async (id: string) => findItemById<Material>(R.material, id, {}, 'materialNo'),
};

// ============ 工序定义 / 工步 / BOP 方案 ============
export const processOperationRepo = {
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<ProcessOperation>(R.processOperation, filter)
      : eadafClient.find<ProcessOperation>(R.processOperation),
  get: async (id: string) =>
    findItemById<ProcessOperation>(R.processOperation, id, {}, 'operationNo'),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<ProcessOperation>(R.processOperation, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<ProcessOperation>(R.processOperation, id, body),
  delete: (id: string) => eadafClient.deleteOne(R.processOperation, id),
};

export const processStepRepo = {
  listByOperation: (operationId: string) =>
    eadafClient.findFiltered<ProcessStep>(R.processStep, { operationId }, { limit: 200 }),
  get: async (id: string) => findItemById<ProcessStep>(R.processStep, id, {}),
  create: (body: Record<string, unknown>) => eadafClient.create<ProcessStep>(R.processStep, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<ProcessStep>(R.processStep, id, body),
  delete: (id: string) => eadafClient.deleteOne(R.processStep, id),
};

export const processStepEdgeRepo = {
  listByFromSteps: async (stepIds: string[]): Promise<ProcessStepEdge[]> => {
    if (stepIds.length === 0) return [];
    const all = await Promise.all(
      stepIds.map((fromStepId) =>
        eadafClient.findFiltered<ProcessStepEdge>(R.processStepEdge, { fromStepId }, { limit: 100 }),
      ),
    );
    const seen = new Set<string>();
    const items: ProcessStepEdge[] = [];
    for (const r of all) {
      for (const e of r.items) {
        if (e.id && seen.has(e.id)) continue;
        if (e.id) seen.add(e.id);
        items.push(e);
      }
    }
    return items;
  },
  create: (body: Record<string, unknown>) =>
    eadafClient.create<ProcessStepEdge>(R.processStepEdge, body),
  delete: (id: string) => eadafClient.deleteOne(R.processStepEdge, id),
};

export const processOperationMaterialRepo = {
  listByOperation: (operationId: string) =>
    eadafClient.findFiltered<ProcessOperationMaterial>(
      R.processOperationMaterial,
      { operationId },
      { limit: 200 },
    ),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<ProcessOperationMaterial>(R.processOperationMaterial, body),
  delete: (id: string) => eadafClient.deleteOne(R.processOperationMaterial, id),
};

export const inspectionItemRepo = {
  listByProcessStep: (processStepId: string) =>
    eadafClient.findFiltered<InspectionItem>(R.inspectionItem, { processStepId }, { limit: 200 }),
  delete: (id: string) => eadafClient.deleteOne(R.inspectionItem, id),
};

export const bopSchemeRepo = {
  get: async (id: string) => findItemById<BopScheme>(R.bopScheme, id, {}),
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<BopScheme>(R.bopScheme, filter)
      : eadafClient.find<BopScheme>(R.bopScheme),
  create: (body: Record<string, unknown>) => eadafClient.create<BopScheme>(R.bopScheme, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<BopScheme>(R.bopScheme, id, body),
  /** 按机型+修理方式查找已发布 BOP 方案 */
  findPublished: async (productModel: string, repairMethod: string) => {
    const res = await eadafClient.findFiltered<BopScheme>(R.bopScheme, {
      productModel,
      repairMethod,
      versionStatus: 'PUBLISHED',
    });
    return res.items[0] ?? null;
  },
};

export const bopOperationNodeRepo = {
  listByScheme: (bopSchemeId: string) =>
    eadafClient.findFiltered<BopOperationNode>(R.bopOperationNode, { bopSchemeId }, { limit: 200 }),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<BopOperationNode>(R.bopOperationNode, body),
  delete: (id: string) => eadafClient.deleteOne(R.bopOperationNode, id),
};

export const bopOperationEdgeRepo = {
  listByScheme: (bopSchemeId: string) =>
    eadafClient.findFiltered<BopOperationEdge>(R.bopOperationEdge, { bopSchemeId }, { limit: 500 }),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<BopOperationEdge>(R.bopOperationEdge, body),
  delete: (id: string) => eadafClient.deleteOne(R.bopOperationEdge, id),
};

// ============ BOM 方案 ============
export const bomSchemeRepo = {
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<BomScheme>(R.bomScheme, filter)
      : eadafClient.find<BomScheme>(R.bomScheme),
  get: async (id: string) => findItemById<BomScheme>(R.bomScheme, id, {}),
  create: (body: Record<string, unknown>) => eadafClient.create<BomScheme>(R.bomScheme, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<BomScheme>(R.bomScheme, id, body),
};

export const bomSchemeNodeRepo = {
  listByScheme: (bomSchemeId: string) =>
    eadafClient.findFiltered<BomSchemeNode>(R.bomSchemeNode, { bomSchemeId }, { limit: 500 }),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<BomSchemeNode>(R.bomSchemeNode, body),
  delete: (id: string) => eadafClient.deleteOne(R.bomSchemeNode, id),
};

// ============ 厂级指令 / 车间令号 ============
export const factoryOrderRepo = {
  list: () => eadafClient.find<FactoryOrder>(R.factoryOrder),
  get: async (id: string) => findItemById<FactoryOrder>(R.factoryOrder, id, {}, 'factoryOrderNo'),
  getByNo: async (factoryOrderNo: string) => {
    const res = await eadafClient.findFiltered<FactoryOrder>(R.factoryOrder, { factoryOrderNo });
    return res.items[0] ?? null;
  },
  create: (body: Record<string, unknown>) => eadafClient.create<FactoryOrder>(R.factoryOrder, body),
};

export const workshopOrderRepo = {
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<WorkshopOrder>(R.workshopOrder, filter)
      : eadafClient.find<WorkshopOrder>(R.workshopOrder),
  get: async (id: string) =>
    findItemById<WorkshopOrder>(R.workshopOrder, id, {}, 'workshopOrderNo'),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<WorkshopOrder>(R.workshopOrder, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WorkshopOrder>(R.workshopOrder, id, body),
};

// ============ BOP / 工序 / 工步实例 ============
export const bopInstanceRepo = {
  getByWorkshopOrder: async (workshopOrderId: string) => {
    const res = await eadafClient.findFiltered<BopInstance>(R.bopInstance, { workshopOrderId });
    return res.items[0] ?? null;
  },
  create: (body: Record<string, unknown>) => eadafClient.create<BopInstance>(R.bopInstance, body),
};

export const operationInstanceRepo = {
  listByBopInstance: (bopInstanceId: string) =>
    eadafClient.findFiltered<OperationInstance>(R.operationInstance, { bopInstanceId }, { limit: 200 }),
  get: async (id: string) => findItemById<OperationInstance>(R.operationInstance, id, {}),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<OperationInstance>(R.operationInstance, body),
};

export const stepInstanceRepo = {
  listByOperation: (operationInstanceId: string) =>
    eadafClient.findFiltered<StepInstance>(R.stepInstance, { operationInstanceId }, { limit: 200 }),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<StepInstance>(R.stepInstance, id, body),
};

// ============ 工卡 ============
export const workCardRepo = {
  list: (
    filter?: Record<string, unknown>,
    opts: { limit?: number; skip?: number } = {},
  ) => {
    const limit = Math.min(opts.limit ?? 100, 100);
    const skip = opts.skip ?? 0;
    return filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<WorkCard>(R.workCard, filter, { limit, skip })
      : eadafClient.find<WorkCard>(R.workCard, { limit, skip });
  },
  /** 按 workshopOrderId 列出工卡 */
  listByOrder: (workshopOrderId: string) =>
    eadafClient.findFiltered<WorkCard>(R.workCard, { workshopOrderId }, { limit: 100 }),
  get: async (id: string) => findItemById<WorkCard>(R.workCard, id, {}, 'workCardNo'),
  getByNo: async (workCardNo: string) => {
    const res = await eadafClient.findFiltered<WorkCard>(R.workCard, { workCardNo });
    return res.items[0] ?? null;
  },
  create: (body: Record<string, unknown>) => eadafClient.create<WorkCard>(R.workCard, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WorkCard>(R.workCard, id, body),
};

export const workCardEdgeRepo = {
  listByFrom: (fromWorkCardId: string) =>
    eadafClient.findFiltered<WorkCardEdge>(R.workCardEdge, { fromWorkCardId }, { limit: 100 }),
  listByTo: (toWorkCardId: string) =>
    eadafClient.findFiltered<WorkCardEdge>(R.workCardEdge, { toWorkCardId }, { limit: 100 }),
};

// ============ 单台计划 / 工卡任务 ============
export const singleUnitPlanRepo = {
  getByWorkshopOrder: async (workshopOrderId: string) => {
    const res = await eadafClient.findFiltered<SingleUnitPlan>(R.singleUnitPlan, {
      workshopOrderId,
    });
    return res.items[0] ?? null;
  },
  create: (body: Record<string, unknown>) =>
    eadafClient.create<SingleUnitPlan>(R.singleUnitPlan, body),
};

export const workCardTaskRepo = {
  listByPlan: (singleUnitPlanId: string) =>
    eadafClient.findFiltered<WorkCardTask>(R.workCardTask, { singleUnitPlanId }, { limit: 200 }),
  listByOrder: async (workshopOrderId: string): Promise<FindResult<WorkCardTask>> => {
    const plan = await singleUnitPlanRepo.getByWorkshopOrder(workshopOrderId);
    if (!plan?.id) return { items: [], total: 0 };
    return workCardTaskRepo.listByPlan(plan.id);
  },
  create: (body: Record<string, unknown>) => eadafClient.create<WorkCardTask>(R.workCardTask, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WorkCardTask>(R.workCardTask, id, body),
};

// ============ 齐套需求 / 委外 ============
export const kitRequirementRepo = {
  listByCard: (workCardId: string) =>
    eadafClient.findFiltered<WorkCardKitRequirement>(R.workCardKitRequirement, { workCardId }, { limit: 200 }),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<WorkCardKitRequirement>(R.workCardKitRequirement, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WorkCardKitRequirement>(R.workCardKitRequirement, id, body),
};

export const outsourcingRepo = {
  listByCard: (workCardId: string) =>
    eadafClient.findFiltered<WorkCardOutsourcing>(R.workCardOutsourcing, { workCardId }, { limit: 200 }),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<WorkCardOutsourcing>(R.workCardOutsourcing, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WorkCardOutsourcing>(R.workCardOutsourcing, id, body),
};

// ============ WBS 节点 ============
export const wbsNodeRepo = {
  listByOrder: (workshopOrderId: string) =>
    eadafClient.findFiltered<WbsNode>(R.wbsNode, { workshopOrderId }, { limit: 500 }),
  get: async (id: string) => findItemById<WbsNode>(R.wbsNode, id, {}, 'code'),
  getByCode: async (code: string) => {
    const res = await eadafClient.findFiltered<WbsNode>(R.wbsNode, { code });
    return res.items[0] ?? null;
  },
  create: (body: Record<string, unknown>) => eadafClient.create<WbsNode>(R.wbsNode, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WbsNode>(R.wbsNode, id, body),
};

/** WBS 树节点（带 children） */
export interface WbsTreeNode extends WbsNode {
  children?: WbsTreeNode[];
}

/**
 * 将扁平 WBS 节点列表组装为多级树。
 * 排序：level 升序、sortOrder 升序。
 */
export function buildWbsTree(nodes: WbsNode[]): WbsTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const la = a.level ?? 0;
    const lb = b.level ?? 0;
    if (la !== lb) return la - lb;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  const byId = new Map<string, WbsTreeNode>();
  const roots: WbsTreeNode[] = [];
  for (const n of sorted) {
    if (n.id) byId.set(n.id, { ...n, children: [] });
  }
  for (const n of sorted) {
    if (!n.id) continue;
    const node = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ============ 排产配置 / 产能 / 工时中位数 / 时段 ============
export const scheduleConfigRepo = {
  /** 取默认配置（configKey=DEFAULT） */
  getDefault: async () => {
    const res = await eadafClient.findFiltered<ScheduleConfig>(R.scheduleConfig, {
      configKey: 'DEFAULT',
    });
    return res.items[0] ?? null;
  },
  list: () => eadafClient.find<ScheduleConfig>(R.scheduleConfig),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<ScheduleConfig>(R.scheduleConfig, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<ScheduleConfig>(R.scheduleConfig, id, body),
};

export const workstationCapacityRepo = {
  list: () => eadafClient.find<WorkstationCapacity>(R.workstationCapacity),
  listByWorkstation: (workstationId: string) =>
    eadafClient.findFiltered<WorkstationCapacity>(R.workstationCapacity, { workstationId }),
  create: (body: Record<string, unknown>) =>
    eadafClient.create<WorkstationCapacity>(R.workstationCapacity, body),
  update: (id: string, body: Record<string, unknown>) =>
    eadafClient.update<WorkstationCapacity>(R.workstationCapacity, id, body),
};

export const workHourMedianRepo = {
  list: () => eadafClient.find<WorkHourMedian>(R.workHourMedian),
  /** 按机型+修理方式+工序取中位数 */
  get: async (productModel: string, repairMethod: string, processOperationId: string) => {
    const res = await eadafClient.findFiltered<WorkHourMedian>(R.workHourMedian, {
      productModel,
      repairMethod,
      processOperationId,
    });
    return res.items[0] ?? null;
  },
};

export const workCardPlanSlotRepo = {
  listByCard: (workCardId: string) =>
    eadafClient.findFiltered<WorkCardPlanSlot>(R.workCardPlanSlot, { workCardId }, { limit: 100 }),
  listByWorkstation: async (workstationId: string): Promise<FindResult<WorkCardPlanSlot>> => {
    // 先取该工位下工卡，再取其时段
    const cards = await eadafClient.findFiltered<WorkCard>(R.workCard, { workstationId }, { limit: 200 });
    const cardIds = cards.items.map((c) => c.id).filter(Boolean) as string[];
    if (cardIds.length === 0) return { items: [], total: 0 };
    const all = await Promise.all(cardIds.map((id) => workCardPlanSlotRepo.listByCard(id)));
    return { items: all.flatMap((r) => r.items), total: all.reduce((s, r) => s + r.total, 0) };
  },
  create: (body: Record<string, unknown>) =>
    eadafClient.create<WorkCardPlanSlot>(R.workCardPlanSlot, body),
};

// ============ 预警 ============
export const alertRecordRepo = {
  list: (filter?: Record<string, unknown>) =>
    filter && Object.keys(filter).length > 0
      ? eadafClient.findFiltered<AlertRecord>(R.alertRecord, filter)
      : eadafClient.find<AlertRecord>(R.alertRecord),
  create: (body: Record<string, unknown>) => eadafClient.create<AlertRecord>(R.alertRecord, body),
};

// ============ 跨实体聚合 ============

/** 取令号聚合视图（车间令号 + 工卡列表 + 单台计划 + BOP 实例） */
export async function getOrderOverview(
  workshopOrderId: string,
): Promise<{
  workshopOrder: WorkshopOrder | null;
  workCards: Array<WorkCard & { operationName?: string | null }>;
  singleUnitPlanId: string | null;
  singleUnitPlanName: string | null;
  bopInstanceId: string | null;
  bopInstanceName: string | null;
}> {
  const [order, cards, plan, bopInstance] = await Promise.all([
    workshopOrderRepo.get(workshopOrderId),
    workCardRepo.listByOrder(workshopOrderId),
    singleUnitPlanRepo.getByWorkshopOrder(workshopOrderId),
    bopInstanceRepo.getByWorkshopOrder(workshopOrderId),
  ]);

  /** 工卡缺 name 时，用工序实例 name / 标准工序 name / 来源节点号兜底 */
  let opLabelById = new Map<string, string>();
  if (bopInstance?.id) {
    const opInsts = await operationInstanceRepo
      .listByBopInstance(bopInstance.id)
      .catch(() => ({ items: [] as OperationInstance[] }));
    const missingProcessIds = [
      ...new Set(
        opInsts.items
          .filter((o) => {
            if (!o.id || !o.processOperationId) return false;
            return !(o.name || o.sourceNodeNo || '').trim();
          })
          .map((o) => o.processOperationId),
      ),
    ];
    const processNameById = new Map<string, string>();
    await Promise.all(
      missingProcessIds.map(async (pid) => {
        const po = await processOperationRepo.get(pid).catch(() => null);
        const label = (po?.name || po?.operationNo || '').trim();
        if (label) processNameById.set(pid, label);
      }),
    );
    for (const o of opInsts.items) {
      if (!o.id) continue;
      const label = (
        o.name ||
        o.sourceNodeNo ||
        (o.processOperationId ? processNameById.get(o.processOperationId) : '') ||
        ''
      ).trim();
      if (label) opLabelById.set(o.id, label);
    }
  }

  const workCards = cards.items.map((c) => {
    const opLabel = c.operationInstanceId ? opLabelById.get(c.operationInstanceId) : undefined;
    const displayName = (c.name || opLabel || '').trim() || null;
    return { ...c, name: c.name || displayName, operationName: displayName };
  });

  let bopInstanceName = (bopInstance?.name || '').trim() || null;
  if (!bopInstanceName && bopInstance?.bopSchemeId) {
    const scheme = await bopSchemeRepo.get(bopInstance.bopSchemeId).catch(() => null);
    bopInstanceName = (scheme?.name || '').trim() || null;
  }
  const orderNo = order?.workshopOrderNo;
  if (!bopInstanceName && bopInstance?.id && orderNo) {
    bopInstanceName = `${orderNo} 维修方案实例`;
  }
  const singleUnitPlanName =
    (plan?.name || '').trim() ||
    (plan?.id && orderNo ? `${orderNo} 单台计划` : null);

  return {
    workshopOrder: order,
    workCards,
    singleUnitPlanId: plan?.id ?? null,
    singleUnitPlanName,
    bopInstanceId: bopInstance?.id ?? null,
    bopInstanceName,
  };
}

/**
 * 齐套校验：检查工卡的齐套需求是否全部满足。
 * 返回 { satisfied, requirements, missing }。
 */
export async function checkKit(workCardId: string): Promise<{
  satisfied: boolean;
  total: number;
  satisfiedCount: number;
  missing: number;
}> {
  const res = await kitRequirementRepo.listByCard(workCardId);
  const total = res.items.length;
  const satisfiedCount = res.items.filter((r) => r.satisfied).length;
  return {
    satisfied: total > 0 && satisfiedCount === total,
    total,
    satisfiedCount,
    missing: total - satisfiedCount,
  };
}

/** 生成业务编号（带时间戳与索引，保证唯一） */
export function genBizNo(prefix: string, index = 0): string {
  const ts = Date.now();
  return index === 0 ? `${prefix}-${ts}` : `${prefix}-${ts}-${index}`;
}

/** 工卡编号生成（WC-令号尾号-序号） */
export function genWorkCardNo(workshopOrderNo: string, seq: number): string {
  const tail = workshopOrderNo.slice(-4);
  return `WC-${tail}-${String(seq).padStart(3, '0')}`;
}

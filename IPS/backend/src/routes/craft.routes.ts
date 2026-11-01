/**
 * 工艺管理编排路由 (/api/ips/*)
 * BOM / 标准工序 / BOP：聚合读、新建、发布/作废/升版/克隆、结构保存。
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import * as repo from '../eadaf/repositories.js';
import { hasDagCycle } from '../lib/dag.js';
import { ok, fail, handleError } from '../lib/response.js';
import { parseOr400 } from '../lib/validate.js';

export const craftRouter = Router();
craftRouter.use(authenticate);

function assertDraft(status: string | undefined): string | null {
  if (status !== 'DRAFT') return '仅编制中版本可修改结构';
  return null;
}

/** EADAF 部分字段拒 null：创建/更新前剔除 */
function omitNullish(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * 工序 operationNo 在 EADAF 上唯一；升版/克隆须换编号。
 * 基码去掉已有 .vN 后缀，从 startVersion 起找第一个未占用的 `{base}.v{n}`。
 */
function operationNoBase(operationNo: string): string {
  return String(operationNo || 'OP')
    .replace(/\.v\d+$/i, '')
    .replace(/@v?\d+$/i, '')
    .replace(/-COPY(-\d+)?$/i, '');
}

async function allocUniqueOperationNo(
  operationNo: string,
  startVersion: number,
): Promise<{ operationNo: string; version: number }> {
  const base = operationNoBase(operationNo);
  let version = Math.max(1, startVersion);
  for (let i = 0; i < 100; i++) {
    const candidate = `${base}.v${version}`;
    const hit = await repo.processOperationRepo.list({ operationNo: candidate });
    if (!hit.items.some((it) => it.operationNo === candidate)) {
      return { operationNo: candidate, version };
    }
    version += 1;
  }
  const fallback = `${base}.v${Date.now()}`;
  return { operationNo: fallback, version: startVersion };
}

async function deleteAll(ids: (string | undefined)[], del: (id: string) => Promise<void>) {
  for (const id of ids) {
    if (id) await del(id);
  }
}

// ─── BOM 聚合读 ───────────────────────────────────────────

craftRouter.get('/bom-schemes/:id', async (req, res) => {
  try {
    const scheme = await repo.bomSchemeRepo.get(req.params.id);
    if (!scheme) return fail(res, 404, 'BOM 方案不存在', null);
    const nodes = await repo.bomSchemeNodeRepo.listByScheme(req.params.id);
    return ok(res, { scheme, nodes: nodes.items });
  } catch (e) {
    return handleError(res, e);
  }
});

const CreateBomSchema = z.object({
  productModel: z.string().min(1),
  version: z.number().optional(),
});

craftRouter.post('/bom-schemes', async (req, res) => {
  try {
    const body = parseOr400(req, res, CreateBomSchema);
    if (!body) return;
    const scheme = await repo.bomSchemeRepo.create({
      productModel: body.productModel,
      version: body.version ?? 1,
      versionStatus: 'DRAFT',
    });
    return ok(res, { scheme });
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/bom-schemes/:id/publish', async (req, res) => {
  try {
    const scheme = await repo.bomSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOM 方案不存在', null);
    if (scheme.versionStatus !== 'DRAFT') return fail(res, 400, '仅编制中可发布', null);
    const nodes = await repo.bomSchemeNodeRepo.listByScheme(scheme.id);
    if (nodes.items.length === 0) return fail(res, 400, 'BOM 结构为空，无法发布', null);
    const updated = await repo.bomSchemeRepo.update(scheme.id, { versionStatus: 'PUBLISHED' });
    return ok(res, { scheme: updated });
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/bom-schemes/:id/obsolete', async (req, res) => {
  try {
    const scheme = await repo.bomSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOM 方案不存在', null);
    if (scheme.versionStatus !== 'PUBLISHED') return fail(res, 400, '仅已发布可作废', null);
    const updated = await repo.bomSchemeRepo.update(scheme.id, { versionStatus: 'OBSOLETE' });
    return ok(res, { scheme: updated });
  } catch (e) {
    return handleError(res, e);
  }
});

async function copyBomNodes(fromSchemeId: string, toSchemeId: string) {
  const nodes = await repo.bomSchemeNodeRepo.listByScheme(fromSchemeId);
  const idMap = new Map<string, string>();
  // 先按无 parent → 有 parent 顺序创建；多轮直到全部创建
  const pending = [...nodes.items];
  let guard = pending.length + 2;
  while (pending.length && guard-- > 0) {
    const next: typeof pending = [];
    for (const n of pending) {
      if (n.parentId && !idMap.has(n.parentId) && nodes.items.some((x) => x.id === n.parentId)) {
        next.push(n);
        continue;
      }
      const created = await repo.bomSchemeNodeRepo.create({
        bomSchemeId: toSchemeId,
        materialId: n.materialId ?? null,
        nodeType: n.nodeType,
        quantity: n.quantity ?? 1,
        parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null,
      });
      if (n.id && created.id) idMap.set(n.id, created.id);
    }
    if (next.length === pending.length) {
      // 无法推进：剩余节点强制挂根
      for (const n of next) {
        const created = await repo.bomSchemeNodeRepo.create({
          bomSchemeId: toSchemeId,
          materialId: n.materialId ?? null,
          nodeType: n.nodeType,
          quantity: n.quantity ?? 1,
          parentId: null,
        });
        if (n.id && created.id) idMap.set(n.id, created.id);
      }
      break;
    }
    pending.length = 0;
    pending.push(...next);
  }
}

craftRouter.post('/bom-schemes/:id/revise', async (req, res) => {
  try {
    const scheme = await repo.bomSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOM 方案不存在', null);
    if (scheme.versionStatus !== 'PUBLISHED') return fail(res, 400, '仅已发布可升版', null);
    const draft = await repo.bomSchemeRepo.create({
      productModel: scheme.productModel,
      version: (Number(scheme.version) || 1) + 1,
      versionStatus: 'DRAFT',
    });
    if (!draft.id) return fail(res, 500, '升版创建失败', null);
    await copyBomNodes(scheme.id, draft.id);
    const nodes = await repo.bomSchemeNodeRepo.listByScheme(draft.id);
    return ok(res, { scheme: draft, nodes: nodes.items });
  } catch (e) {
    return handleError(res, e);
  }
});

const CloneBomSchema = z.object({
  productModel: z.string().min(1).optional(),
});

craftRouter.post('/bom-schemes/:id/clone', async (req, res) => {
  try {
    const body = parseOr400(req, res, CloneBomSchema);
    if (!body) return;
    const scheme = await repo.bomSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOM 方案不存在', null);
    const draft = await repo.bomSchemeRepo.create({
      productModel: body.productModel ?? scheme.productModel,
      version: 1,
      versionStatus: 'DRAFT',
    });
    if (!draft.id) return fail(res, 500, '克隆创建失败', null);
    await copyBomNodes(scheme.id, draft.id);
    const nodes = await repo.bomSchemeNodeRepo.listByScheme(draft.id);
    return ok(res, { scheme: draft, nodes: nodes.items });
  } catch (e) {
    return handleError(res, e);
  }
});

const BomTreeNodeSchema = z.object({
  clientKey: z.string().min(1),
  parentClientKey: z.string().nullable().optional(),
  materialId: z.string().nullable().optional(),
  nodeType: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).optional(),
});

const BomTreeSchema = z.object({
  nodes: z.array(BomTreeNodeSchema),
});

craftRouter.put('/bom-schemes/:id/tree', async (req, res) => {
  try {
    const body = parseOr400(req, res, BomTreeSchema);
    if (!body) return;
    const scheme = await repo.bomSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOM 方案不存在', null);
    const err = assertDraft(scheme.versionStatus);
    if (err) return fail(res, 400, err, null);

    // 层级校验
    const byKey = new Map(body.nodes.map((n) => [n.clientKey, n]));
    for (const n of body.nodes) {
      if (!n.parentClientKey) continue;
      const parent = byKey.get(n.parentClientKey);
      if (!parent) return fail(res, 400, `父节点不存在: ${n.parentClientKey}`, null);
      if (
        (n.nodeType === 'PART_LARGE' || n.nodeType === 'PART_SMALL') &&
        parent.nodeType === 'LANDING_GEAR'
      ) {
        return fail(res, 400, '零件不得直接挂在起落架根下，须挂在大部件下', null);
      }
    }
    const roots = body.nodes.filter((n) => !n.parentClientKey);
    if (roots.length > 1) return fail(res, 400, 'BOM 只能有一个根节点', null);

    const existing = await repo.bomSchemeNodeRepo.listByScheme(scheme.id);
    await deleteAll(
      existing.items.map((n) => n.id),
      (id) => repo.bomSchemeNodeRepo.delete(id),
    );

    const idMap = new Map<string, string>();
    const pending = [...body.nodes];
    let guard = pending.length + 2;
    while (pending.length && guard-- > 0) {
      const next: typeof pending = [];
      for (const n of pending) {
        if (n.parentClientKey && !idMap.has(n.parentClientKey)) {
          next.push(n);
          continue;
        }
        const created = await repo.bomSchemeNodeRepo.create({
          bomSchemeId: scheme.id,
          materialId: n.materialId ?? null,
          nodeType: n.nodeType,
          quantity: n.quantity ?? 1,
          parentId: n.parentClientKey ? idMap.get(n.parentClientKey) ?? null : null,
        });
        if (created.id) idMap.set(n.clientKey, created.id);
      }
      if (next.length === pending.length) break;
      pending.length = 0;
      pending.push(...next);
    }

    const nodes = await repo.bomSchemeNodeRepo.listByScheme(scheme.id);
    return ok(res, { scheme, nodes: nodes.items });
  } catch (e) {
    return handleError(res, e);
  }
});

// ─── 工序 ───────────────────────────────────────────────

async function loadOperationBundle(id: string) {
  const operation = await repo.processOperationRepo.get(id);
  if (!operation?.id) return null;
  const stepsRes = await repo.processStepRepo.listByOperation(operation.id);
  const steps = stepsRes.items;
  const stepIds = steps.map((s) => s.id!).filter(Boolean);
  const stepEdges = await repo.processStepEdgeRepo.listByFromSteps(stepIds);
  const materials = await repo.processOperationMaterialRepo.listByOperation(operation.id);
  return { operation, steps, stepEdges, materials: materials.items };
}

// 覆盖/增强：由 craftRouter 与 opRouter 并存时，先注册的生效——app 中 craft 挂在 op 前
craftRouter.get('/process-operations/:id', async (req, res) => {
  try {
    const data = await loadOperationBundle(req.params.id);
    if (!data) return fail(res, 404, '工序不存在', null);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

const CreateOpSchema = z.object({
  operationNo: z.string().min(1),
  category: z.string().optional(),
  standardHours: z.union([z.string(), z.number()]).optional(),
  prepareHours: z.union([z.string(), z.number()]).nullable().optional(),
  assistHours: z.union([z.string(), z.number()]).nullable().optional(),
  kitRequired: z.boolean().optional(),
  defaultWorkstationId: z.string().nullable().optional(),
});

craftRouter.post('/process-operations', async (req, res) => {
  try {
    const body = parseOr400(req, res, CreateOpSchema);
    if (!body) return;
    const operation = await repo.processOperationRepo.create({
      ...body,
      version: 1,
      versionStatus: 'DRAFT',
      kitRequired: body.kitRequired ?? false,
    });
    return ok(res, { operation });
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/process-operations/:id/publish', async (req, res) => {
  try {
    const op = await repo.processOperationRepo.get(req.params.id);
    if (!op?.id) return fail(res, 404, '工序不存在', null);
    if (op.versionStatus !== 'DRAFT') return fail(res, 400, '仅编制中可发布', null);
    if (op.standardHours == null || op.standardHours === '') {
      return fail(res, 400, '发布前须填写标准工时', null);
    }
    if (!op.defaultWorkstationId) {
      return fail(res, 400, '发布前须指定目标工位', null);
    }
    const updated = await repo.processOperationRepo.update(op.id, { versionStatus: 'PUBLISHED' });
    return ok(res, { operation: updated });
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/process-operations/:id/obsolete', async (req, res) => {
  try {
    const op = await repo.processOperationRepo.get(req.params.id);
    if (!op?.id) return fail(res, 404, '工序不存在', null);
    if (op.versionStatus !== 'PUBLISHED') return fail(res, 400, '仅已发布可作废', null);
    const updated = await repo.processOperationRepo.update(op.id, { versionStatus: 'OBSOLETE' });
    return ok(res, { operation: updated });
  } catch (e) {
    return handleError(res, e);
  }
});

async function copyOperationChildren(fromId: string, toId: string) {
  const stepsRes = await repo.processStepRepo.listByOperation(fromId);
  const stepMap = new Map<string, string>();
  for (const s of stepsRes.items) {
    const created = await repo.processStepRepo.create(
      omitNullish({
        operationId: toId,
        stepNo: s.stepNo,
        sortOrder: s.sortOrder ?? 0,
        isInspectionPoint: s.isInspectionPoint ?? false,
        isMandatoryInspection: s.isMandatoryInspection ?? false,
        inspectionSpec: s.inspectionSpec,
        standardHours: s.standardHours,
        name: s.name,
        remark: s.remark,
      }),
    );
    if (s.id && created.id) stepMap.set(s.id, created.id);
  }
  const edges = await repo.processStepEdgeRepo.listByFromSteps([...stepMap.keys()]);
  for (const e of edges) {
    const from = stepMap.get(e.fromStepId);
    const to = stepMap.get(e.toStepId);
    if (!from || !to) continue;
    await repo.processStepEdgeRepo.create({
      fromStepId: from,
      toStepId: to,
      edgeType: e.edgeType || 'NORMAL',
    });
  }
  const mats = await repo.processOperationMaterialRepo.listByOperation(fromId);
  for (const m of mats.items) {
    await repo.processOperationMaterialRepo.create(
      omitNullish({
        operationId: toId,
        materialId: m.materialId,
        quantity: m.quantity ?? 1,
        isCollaboration: m.isCollaboration ?? false,
        kitCheck: m.kitCheck ?? false,
      }),
    );
  }
}

craftRouter.post('/process-operations/:id/revise', async (req, res) => {
  try {
    const op = await repo.processOperationRepo.get(req.params.id);
    if (!op?.id) return fail(res, 404, '工序不存在', null);
    if (op.versionStatus !== 'PUBLISHED') return fail(res, 400, '仅已发布可升版', null);
    const allocated = await allocUniqueOperationNo(
      op.operationNo,
      (Number(op.version) || 1) + 1,
    );
    const draft = await repo.processOperationRepo.create(
      omitNullish({
        operationNo: allocated.operationNo,
        version: allocated.version,
        versionStatus: 'DRAFT',
        category: op.category ?? 'ROUTINE',
        standardHours: op.standardHours,
        prepareHours: op.prepareHours,
        assistHours: op.assistHours,
        kitRequired: op.kitRequired ?? false,
        defaultWorkstationId: op.defaultWorkstationId,
      }),
    );
    if (!draft.id) return fail(res, 500, '升版失败', null);
    await copyOperationChildren(op.id, draft.id);
    const data = await loadOperationBundle(draft.id);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/process-operations/:id/clone', async (req, res) => {
  try {
    const op = await repo.processOperationRepo.get(req.params.id);
    if (!op?.id) return fail(res, 404, '工序不存在', null);
    const body = (req.body ?? {}) as { operationNo?: string };
    let operationNo = body.operationNo;
    let version = 1;
    if (!operationNo) {
      const allocated = await allocUniqueOperationNo(op.operationNo, 1);
      operationNo = `${allocated.operationNo}-COPY`;
      // COPY 后缀仍可能撞号：再探测一次
      const hit = await repo.processOperationRepo.list({ operationNo });
      if (hit.items.some((it) => it.operationNo === operationNo)) {
        operationNo = `${allocated.operationNo}-COPY-${Date.now()}`;
      }
      version = allocated.version;
    }
    const draft = await repo.processOperationRepo.create(
      omitNullish({
        operationNo,
        version,
        versionStatus: 'DRAFT',
        category: op.category ?? 'ROUTINE',
        standardHours: op.standardHours,
        prepareHours: op.prepareHours,
        assistHours: op.assistHours,
        kitRequired: op.kitRequired ?? false,
        defaultWorkstationId: op.defaultWorkstationId,
      }),
    );
    if (!draft.id) return fail(res, 500, '克隆失败', null);
    await copyOperationChildren(op.id, draft.id);
    const data = await loadOperationBundle(draft.id);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

const OpStructureSchema = z.object({
  operation: z
    .object({
      category: z.string().optional(),
      standardHours: z.union([z.string(), z.number()]).nullable().optional(),
      prepareHours: z.union([z.string(), z.number()]).nullable().optional(),
      assistHours: z.union([z.string(), z.number()]).nullable().optional(),
      kitRequired: z.boolean().optional(),
      defaultWorkstationId: z.string().nullable().optional(),
    })
    .optional(),
  steps: z.array(
    z.object({
      /** 已落库工步 id；有则 update，无则 create */
      id: z.string().optional(),
      clientKey: z.string().min(1),
      stepNo: z.string().min(1),
      name: z.string().nullable().optional(),
      remark: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
      isInspectionPoint: z.boolean().optional(),
      isMandatoryInspection: z.boolean().optional(),
      inspectionSpec: z.string().nullable().optional(),
      standardHours: z.union([z.string(), z.number()]).nullable().optional(),
    }),
  ),
  edges: z.array(
    z.object({
      fromClientKey: z.string().min(1),
      toClientKey: z.string().min(1),
      edgeType: z.string().default('NORMAL'),
    }),
  ),
  materials: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantity: z.union([z.string(), z.number()]).optional(),
        isCollaboration: z.boolean().optional(),
        kitCheck: z.boolean().optional(),
      }),
    )
    .optional(),
});

craftRouter.put('/process-operations/:id/structure', async (req, res) => {
  try {
    const body = parseOr400(req, res, OpStructureSchema);
    if (!body) return;
    const op = await repo.processOperationRepo.get(req.params.id);
    if (!op?.id) return fail(res, 404, '工序不存在', null);
    const err = assertDraft(op.versionStatus);
    if (err) return fail(res, 400, err, null);

    if (
      hasDagCycle(
        body.steps.map((s) => s.clientKey),
        body.edges.map((e) => ({ fromId: e.fromClientKey, toId: e.toClientKey })),
      )
    ) {
      return fail(res, 400, '工步网络存在环路，禁止保存', null);
    }

    if (body.operation) {
      await repo.processOperationRepo.update(op.id, body.operation);
    }

    const oldSteps = await repo.processStepRepo.listByOperation(op.id);
    const oldStepIds = oldSteps.items.map((s) => s.id!).filter(Boolean);
    const keepIds = new Set(
      body.steps.map((s) => s.id).filter((x): x is string => !!x),
    );

    // 删除未保留的工步：先清检验项，再清边，再删工步
    const toDeleteStepIds = oldStepIds.filter((id) => !keepIds.has(id));
    if (toDeleteStepIds.length > 0) {
      for (const stepId of toDeleteStepIds) {
        const items = await repo.inspectionItemRepo.listByProcessStep(stepId).catch(() => ({
          items: [] as { id?: string }[],
        }));
        await deleteAll(
          items.items.map((it) => it.id),
          (id) => repo.inspectionItemRepo.delete(id),
        );
      }
      const oldEdges = await repo.processStepEdgeRepo.listByFromSteps(oldStepIds);
      const edgesTouchingDeleted = oldEdges.filter(
        (e) =>
          (e.fromStepId && toDeleteStepIds.includes(e.fromStepId)) ||
          (e.toStepId && toDeleteStepIds.includes(e.toStepId)),
      );
      await deleteAll(
        edgesTouchingDeleted.map((e) => e.id),
        (id) => repo.processStepEdgeRepo.delete(id),
      );
      await deleteAll(toDeleteStepIds, (id) => repo.processStepRepo.delete(id));
    }

    // 边全量替换（无检验外键）
    const remainingStepIds = oldStepIds.filter((id) => keepIds.has(id));
    const remainingEdges = await repo.processStepEdgeRepo.listByFromSteps(remainingStepIds);
    await deleteAll(
      remainingEdges.map((e) => e.id),
      (id) => repo.processStepEdgeRepo.delete(id),
    );

    const oldMats = await repo.processOperationMaterialRepo.listByOperation(op.id);
    await deleteAll(
      oldMats.items.map((m) => m.id),
      (id) => repo.processOperationMaterialRepo.delete(id),
    );

    const stepMap = new Map<string, string>();
    for (const s of body.steps) {
      const payload = omitNullish({
        operationId: op.id,
        stepNo: s.stepNo,
        name: s.name,
        remark: s.remark,
        sortOrder: s.sortOrder ?? 0,
        isInspectionPoint: s.isInspectionPoint ?? false,
        isMandatoryInspection: s.isMandatoryInspection ?? false,
        inspectionSpec: s.inspectionSpec,
        standardHours: s.standardHours,
      });
      if (s.id && keepIds.has(s.id)) {
        await repo.processStepRepo.update(s.id, payload);
        stepMap.set(s.clientKey, s.id);
      } else {
        const created = await repo.processStepRepo.create(payload);
        if (created.id) stepMap.set(s.clientKey, created.id);
      }
    }
    for (const e of body.edges) {
      const from = stepMap.get(e.fromClientKey);
      const to = stepMap.get(e.toClientKey);
      if (!from || !to) continue;
      await repo.processStepEdgeRepo.create({
        fromStepId: from,
        toStepId: to,
        edgeType: e.edgeType || 'NORMAL',
      });
    }
    for (const m of body.materials ?? []) {
      await repo.processOperationMaterialRepo.create({
        operationId: op.id,
        materialId: m.materialId,
        quantity: m.quantity ?? 1,
        isCollaboration: m.isCollaboration ?? false,
        kitCheck: m.kitCheck ?? false,
      });
    }

    const data = await loadOperationBundle(op.id);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

// ─── BOP ────────────────────────────────────────────────

async function loadBopBundle(id: string) {
  const scheme = await repo.bopSchemeRepo.get(id);
  if (!scheme?.id) return null;
  const nodes = await repo.bopOperationNodeRepo.listByScheme(scheme.id);
  const edges = await repo.bopOperationEdgeRepo.listByScheme(scheme.id);
  return { scheme, nodes: nodes.items, edges: edges.items };
}

craftRouter.get('/bop-schemes/:id', async (req, res) => {
  try {
    const data = await loadBopBundle(req.params.id);
    if (!data) return fail(res, 404, 'BOP 方案不存在', null);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

const CreateBopSchema = z.object({
  productModel: z.string().min(1),
  repairMethod: z.enum(['OVERHAUL', 'CHECK', 'DETECT', 'OIL_SEAL', 'TROUBLESHOOT']),
  bomSchemeId: z.string().nullable().optional(),
  batchSerial: z.string().nullable().optional(),
});

craftRouter.post('/bop-schemes', async (req, res) => {
  try {
    const body = parseOr400(req, res, CreateBopSchema);
    if (!body) return;
    const scheme = await repo.bopSchemeRepo.create({
      productModel: body.productModel,
      repairMethod: body.repairMethod,
      bomSchemeId: body.bomSchemeId ?? null,
      batchSerial: body.batchSerial ?? null,
      version: 1,
      versionStatus: 'DRAFT',
    });
    return ok(res, { scheme });
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/bop-schemes/:id/publish', async (req, res) => {
  try {
    const scheme = await repo.bopSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOP 方案不存在', null);
    if (scheme.versionStatus !== 'DRAFT') return fail(res, 400, '仅编制中可发布', null);
    if (!scheme.bomSchemeId && scheme.repairMethod !== 'TROUBLESHOOT') {
      return fail(res, 400, '发布前须关联 BOM 方案', null);
    }
    const nodes = await repo.bopOperationNodeRepo.listByScheme(scheme.id);
    if (nodes.items.length === 0) return fail(res, 400, 'BOP 无工序节点，无法发布', null);
    const edges = await repo.bopOperationEdgeRepo.listByScheme(scheme.id);
    if (
      hasDagCycle(
        nodes.items.map((n) => n.id!),
        edges.items.map((e) => ({ fromId: e.fromNodeId, toId: e.toNodeId })),
      )
    ) {
      return fail(res, 400, 'BOP 工序网络存在环路，无法发布', null);
    }
    const updated = await repo.bopSchemeRepo.update(scheme.id, { versionStatus: 'PUBLISHED' });
    return ok(res, { scheme: updated });
  } catch (e) {
    return handleError(res, e);
  }
});

craftRouter.post('/bop-schemes/:id/obsolete', async (req, res) => {
  try {
    const scheme = await repo.bopSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOP 方案不存在', null);
    if (scheme.versionStatus !== 'PUBLISHED') return fail(res, 400, '仅已发布可作废', null);
    const updated = await repo.bopSchemeRepo.update(scheme.id, { versionStatus: 'OBSOLETE' });
    return ok(res, { scheme: updated });
  } catch (e) {
    return handleError(res, e);
  }
});

async function copyBopChildren(fromId: string, toId: string) {
  const nodes = await repo.bopOperationNodeRepo.listByScheme(fromId);
  const nodeMap = new Map<string, string>();
  for (const n of nodes.items) {
    const created = await repo.bopOperationNodeRepo.create({
      bopSchemeId: toId,
      nodeNo: n.nodeNo,
      operationId: n.operationId,
      materialId: n.materialId ?? null,
      sortOrder: n.sortOrder ?? 0,
    });
    if (n.id && created.id) nodeMap.set(n.id, created.id);
  }
  const edges = await repo.bopOperationEdgeRepo.listByScheme(fromId);
  for (const e of edges.items) {
    const from = nodeMap.get(e.fromNodeId);
    const to = nodeMap.get(e.toNodeId);
    if (!from || !to) continue;
    await repo.bopOperationEdgeRepo.create({
      bopSchemeId: toId,
      fromNodeId: from,
      toNodeId: to,
      edgeType: e.edgeType || 'NORMAL',
    });
  }
}

craftRouter.post('/bop-schemes/:id/revise', async (req, res) => {
  try {
    const scheme = await repo.bopSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOP 方案不存在', null);
    if (scheme.versionStatus !== 'PUBLISHED') return fail(res, 400, '仅已发布可升版', null);
    const draft = await repo.bopSchemeRepo.create(
      omitNullish({
        productModel: scheme.productModel,
        repairMethod: scheme.repairMethod,
        bomSchemeId: scheme.bomSchemeId,
        batchSerial: scheme.batchSerial,
        clonedFromId: scheme.id,
        version: (Number(scheme.version) || 1) + 1,
        versionStatus: 'DRAFT',
      }),
    );
    if (!draft.id) return fail(res, 500, '升版失败', null);
    await copyBopChildren(scheme.id, draft.id);
    const data = await loadBopBundle(draft.id);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

const CloneBopSchema = z.object({
  productModel: z.string().min(1).optional(),
  repairMethod: z
    .enum(['OVERHAUL', 'CHECK', 'DETECT', 'OIL_SEAL', 'TROUBLESHOOT'])
    .optional(),
  bomSchemeId: z.string().nullable().optional(),
  batchSerial: z.string().nullable().optional(),
});

craftRouter.post('/bop-schemes/:id/clone', async (req, res) => {
  try {
    const body = parseOr400(req, res, CloneBopSchema);
    if (!body) return;
    const scheme = await repo.bopSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOP 方案不存在', null);

    const targetBomId = body.bomSchemeId !== undefined ? body.bomSchemeId : scheme.bomSchemeId;
    const draft = await repo.bopSchemeRepo.create({
      productModel: body.productModel ?? scheme.productModel,
      repairMethod: body.repairMethod ?? scheme.repairMethod,
      bomSchemeId: targetBomId ?? null,
      batchSerial: body.batchSerial !== undefined ? body.batchSerial : scheme.batchSerial,
      clonedFromId: scheme.id,
      version: 1,
      versionStatus: 'DRAFT',
    });
    if (!draft.id) return fail(res, 500, '克隆失败', null);
    await copyBopChildren(scheme.id, draft.id);

    const warnings: string[] = [];
    const crossModel =
      (body.productModel && body.productModel !== scheme.productModel) ||
      (body.bomSchemeId && body.bomSchemeId !== scheme.bomSchemeId);
    if (crossModel && targetBomId) {
      const bomNodes = await repo.bomSchemeNodeRepo.listByScheme(targetBomId);
      const bomMatIds = new Set(
        bomNodes.items.map((n) => n.materialId).filter(Boolean) as string[],
      );
      const bopNodes = await repo.bopOperationNodeRepo.listByScheme(draft.id);
      for (const n of bopNodes.items) {
        const mats = await repo.processOperationMaterialRepo.listByOperation(n.operationId);
        for (const m of mats.items) {
          if (m.materialId && !bomMatIds.has(m.materialId)) {
            warnings.push(
              `工序节点 ${n.nodeNo} 挂载物料 ${m.materialId} 不在目标 BOM 中`,
            );
          }
        }
      }
    }

    const data = await loadBopBundle(draft.id);
    return ok(res, { ...data, warnings });
  } catch (e) {
    return handleError(res, e);
  }
});

const BopStructureSchema = z.object({
  scheme: z
    .object({
      productModel: z.string().optional(),
      repairMethod: z.string().optional(),
      bomSchemeId: z.string().nullable().optional(),
      batchSerial: z.string().nullable().optional(),
    })
    .optional(),
  nodes: z.array(
    z.object({
      clientKey: z.string().min(1),
      nodeNo: z.string().min(1),
      operationId: z.string().min(1),
      materialId: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
    }),
  ),
  edges: z.array(
    z.object({
      fromClientKey: z.string().min(1),
      toClientKey: z.string().min(1),
      edgeType: z.string().default('NORMAL'),
    }),
  ),
});

craftRouter.put('/bop-schemes/:id/structure', async (req, res) => {
  try {
    const body = parseOr400(req, res, BopStructureSchema);
    if (!body) return;
    const scheme = await repo.bopSchemeRepo.get(req.params.id);
    if (!scheme?.id) return fail(res, 404, 'BOP 方案不存在', null);
    const err = assertDraft(scheme.versionStatus);
    if (err) return fail(res, 400, err, null);

    if (
      hasDagCycle(
        body.nodes.map((n) => n.clientKey),
        body.edges.map((e) => ({ fromId: e.fromClientKey, toId: e.toClientKey })),
      )
    ) {
      return fail(res, 400, 'BOP 工序网络存在环路，禁止保存', null);
    }

    // 仅允许引用已发布工序
    for (const n of body.nodes) {
      const op = await repo.processOperationRepo.get(n.operationId);
      if (!op) return fail(res, 400, `工序不存在: ${n.operationId}`, null);
      if (op.versionStatus !== 'PUBLISHED') {
        return fail(res, 400, `仅可引用已发布工序: ${op.operationNo}`, null);
      }
    }

    if (body.scheme) {
      await repo.bopSchemeRepo.update(scheme.id, body.scheme);
    }

    const oldNodes = await repo.bopOperationNodeRepo.listByScheme(scheme.id);
    const oldEdges = await repo.bopOperationEdgeRepo.listByScheme(scheme.id);
    await deleteAll(
      oldEdges.items.map((e) => e.id),
      (id) => repo.bopOperationEdgeRepo.delete(id),
    );
    await deleteAll(
      oldNodes.items.map((n) => n.id),
      (id) => repo.bopOperationNodeRepo.delete(id),
    );

    const nodeMap = new Map<string, string>();
    for (const n of body.nodes) {
      const created = await repo.bopOperationNodeRepo.create({
        bopSchemeId: scheme.id,
        nodeNo: n.nodeNo,
        operationId: n.operationId,
        materialId: n.materialId ?? null,
        sortOrder: n.sortOrder ?? 0,
      });
      if (created.id) nodeMap.set(n.clientKey, created.id);
    }
    for (const e of body.edges) {
      const from = nodeMap.get(e.fromClientKey);
      const to = nodeMap.get(e.toClientKey);
      if (!from || !to) continue;
      await repo.bopOperationEdgeRepo.create({
        bopSchemeId: scheme.id,
        fromNodeId: from,
        toNodeId: to,
        edgeType: e.edgeType || 'NORMAL',
      });
    }

    const data = await loadBopBundle(scheme.id);
    return ok(res, data);
  } catch (e) {
    return handleError(res, e);
  }
});

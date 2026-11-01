/**
 * 高级产线业务 — 分拣可视化引导
 *
 * 一张已发布维修方案对应一张行迹盘示意图。物料分类取该方案 BOM 里挂有子件的节点；
 * 子件数量为 N 时生成 N 个槽，每槽一件，热区坐标相对图片为 0–1。
 */
import { Router } from 'express';
import multer from 'multer';
import { EADAF_ROUTES } from '@ips/shared';
import { authenticate } from '../middleware/auth.js';
import { eadafClient } from '../eadaf/EADAFClient.js';
import { ok, fail, handleError } from '../lib/response.js';

export const sortingGuideRouter = Router();
sortingGuideRouter.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

type Row = Record<string, unknown>;

interface HotZone {
  shape?: 'rect' | 'square' | 'circle';
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SlotInput {
  id?: string;
  materialId?: string;
  partCode?: string;
  instanceNo?: number;
  slotCode?: string;
  hotZone?: HotZone | null;
  required?: boolean;
  sortOrder?: number;
  slotStatus?: string;
}

const TEMPLATE = EADAF_ROUTES.trayTemplate;
const SLOT = EADAF_ROUTES.traySlot;

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function parseZone(value: unknown): HotZone | null {
  if (!value) return null;
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) as HotZone : value as HotZone;
    if (![raw.x, raw.y, raw.w, raw.h].every((n) => Number.isFinite(n))) return null;
    return {
      shape: raw.shape === 'circle' || raw.shape === 'rect' ? raw.shape : 'square',
      x: Number(raw.x),
      y: Number(raw.y),
      w: Number(raw.w),
      h: Number(raw.h),
    };
  } catch {
    return null;
  }
}

async function loadAll(routePath: string, filter?: Row): Promise<Row[]> {
  const items: Row[] = [];
  for (let skip = 0; skip < 300; skip += 100) {
    const res = await eadafClient.find<Row>(routePath, { limit: 100, skip, filter });
    items.push(...res.items);
    if (res.items.length < 100) break;
  }
  return items;
}

async function materialMap(): Promise<Map<string, Row>> {
  const rows = await loadAll(EADAF_ROUTES.material);
  return new Map(rows.filter((row) => row.id).map((row) => [text(row.id), row]));
}

function materialLabel(row: Row | undefined): string {
  if (!row) return '';
  return [text(row.materialNo), text(row.name)].filter(Boolean).join(' ');
}

function presentSlot(row: Row, materials: Map<string, Row>): Row & { hotZone: HotZone | null; materialNo: string; materialName: string } {
  const material = materials.get(text(row.materialId));
  return {
    ...row,
    hotZone: parseZone(row.hotZone),
    materialNo: text(material?.materialNo),
    materialName: text(material?.name),
  };
}

sortingGuideRouter.get('/sorting-guides', async (_req, res) => {
  try {
    const [templates, schemes, materials] = await Promise.all([
      loadAll(TEMPLATE),
      loadAll(EADAF_ROUTES.bopScheme),
      materialMap(),
    ]);
    const schemeById = new Map(schemes.map((row) => [text(row.id), row]));
    const classIds = [...new Set(templates.map((row) => text(row.materialClassId)).filter(Boolean))];
    const classNames = new Map<string, string>();
    if (classIds.length) {
      const nodes = await loadAll(EADAF_ROUTES.bomSchemeNode);
      for (const node of nodes) {
        if (!classIds.includes(text(node.id))) continue;
        classNames.set(text(node.id), materialLabel(materials.get(text(node.materialId))) || text(node.name) || '物料分类');
      }
    }
    const items = templates.map((row) => {
      const scheme = schemeById.get(text(row.bopSchemeId));
      return {
        ...row,
        schemeName: scheme ? `${text(scheme.productModel)} ${text(scheme.name)}`.trim() : '',
        className: text(row.materialClassId) ? (classNames.get(text(row.materialClassId)) ?? '') : '整单',
      };
    });
    res.json({ code: 200, message: 'success', data: { items, total: items.length } });
  } catch (e) {
    handleError(res, e);
  }
});

sortingGuideRouter.get('/sorting-guides/options', async (req, res) => {
  try {
    const bopSchemeId = text(req.query.bopSchemeId);
    if (!bopSchemeId) return fail(res, 400, '缺少维修方案');
    const schemes = await loadAll(EADAF_ROUTES.bopScheme);
    const scheme = schemes.find((row) => text(row.id) === bopSchemeId);
    if (!scheme) return fail(res, 404, '维修方案不存在');
    const bomSchemeId = text(scheme.bomSchemeId);
    if (!bomSchemeId) {
      return ok(res, { classes: [] });
    }
    const [nodes, materials] = await Promise.all([
      loadAll(EADAF_ROUTES.bomSchemeNode, { bomSchemeId }),
      materialMap(),
    ]);
    const parentIds = new Set(nodes.map((node) => text(node.parentId)).filter(Boolean));
    const toItem = (node: Row) => {
      const material = materials.get(text(node.materialId));
      return {
        nodeId: text(node.id),
        materialId: text(node.materialId),
        materialNo: text(material?.materialNo),
        name: text(material?.name) || text(node.name),
        quantity: Math.max(1, Number(node.quantity) || 1),
      };
    };
    const classNodes = nodes.filter((node) => parentIds.has(text(node.id)));
    const classes = classNodes.length
      ? classNodes.map((node) => ({
          id: text(node.id),
          name: materialLabel(materials.get(text(node.materialId))) || text(node.name) || '物料分类',
          items: nodes.filter((child) => text(child.parentId) === text(node.id) && child.materialId).map(toItem),
        }))
      : [{
          id: '',
          name: '整单',
          items: nodes.filter((node) => node.materialId).map(toItem),
        }];
    ok(res, { classes });
  } catch (e) {
    handleError(res, e);
  }
});

sortingGuideRouter.post('/sorting-guides/upload', (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : '上传失败';
      return fail(res, 400, message);
    }
    next();
  });
}, async (req, res) => {
  try {
    const file = req.file;
    if (!file) return fail(res, 400, '缺少文件');
    const objectId = await eadafClient.uploadObject(file.buffer, file.originalname, {
      mimeType: file.mimetype,
    });
    if (!objectId) return fail(res, 502, 'EADAF 未返回文件编号');
    ok(res, { object_id: objectId });
  } catch (e) {
    handleError(res, e);
  }
});

sortingGuideRouter.get('/sorting-guides/preview/:objectId', async (req, res) => {
  try {
    const resp = await eadafClient.previewObject(req.params.objectId);
    if (!resp.ok) return fail(res, resp.status, '预览失败');
    res.setHeader('Content-Type', resp.headers.get('content-type') ?? 'image/jpeg');
    res.send(Buffer.from(await resp.arrayBuffer()));
  } catch (e) {
    handleError(res, e);
  }
});

sortingGuideRouter.get('/sorting-guides/:id', async (req, res) => {
  try {
    const templates = await loadAll(TEMPLATE);
    const template = templates.find((row) => text(row.id) === req.params.id);
    if (!template) return fail(res, 404, '模版不存在');
    const [slots, materials] = await Promise.all([
      loadAll(SLOT, { templateId: req.params.id }),
      materialMap(),
    ]);
    ok(res, {
      template,
      slots: slots
        .map((row) => presentSlot(row, materials))
        .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
    });
  } catch (e) {
    handleError(res, e);
  }
});

function compact(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function templateBody(input: Row, status: string): Row {
  return compact({
    templateCode: input.templateCode,
    templateName: input.templateName,
    workstationType: input.workstationType || 'sorting',
    photoObjectId: input.photoObjectId,
    bopSchemeId: input.bopSchemeId,
    materialClassId: input.materialClassId,
    status,
  });
}

async function replaceSlots(templateId: string, slots: SlotInput[]): Promise<void> {
  const existing = await loadAll(SLOT, { templateId });
  const keep = new Set(slots.map((slot) => slot.id).filter(Boolean));
  for (const row of existing) {
    if (!keep.has(text(row.id))) await eadafClient.deleteOne(SLOT, text(row.id));
  }
  for (const [index, slot] of slots.entries()) {
    const body = compact({
      templateId,
      materialId: slot.materialId,
      partCode: slot.partCode,
      instanceNo: slot.instanceNo ?? index + 1,
      slotCode: slot.slotCode,
      hotZone: slot.hotZone ? JSON.stringify(slot.hotZone) : undefined,
      required: slot.required !== false,
      sortOrder: slot.sortOrder ?? index + 1,
      slotStatus: slot.slotStatus || 'empty',
    });
    if (slot.id && existing.some((row) => text(row.id) === slot.id)) {
      await eadafClient.update(SLOT, slot.id, body);
    } else {
      await eadafClient.create(SLOT, body);
    }
  }
}

sortingGuideRouter.post('/sorting-guides', async (req, res) => {
  try {
    const body = req.body as Row & { slots?: SlotInput[] };
    if (!body.templateCode || !body.templateName) return fail(res, 400, '请填写编码和名称');
    const created = await eadafClient.create<Row>(TEMPLATE, templateBody(body, 'draft'));
    const id = text(created.id);
    if (body.slots?.length) await replaceSlots(id, body.slots);
    ok(res, { id });
  } catch (e) {
    handleError(res, e);
  }
});

sortingGuideRouter.put('/sorting-guides/:id', async (req, res) => {
  try {
    const body = req.body as Row & { slots?: SlotInput[]; status?: string };
    if (!body.templateCode || !body.templateName) return fail(res, 400, '请填写编码和名称');
    const status = body.status === 'published' ? 'published' : 'draft';
    if (status === 'published') {
      const missing = (body.slots ?? []).filter((slot) => !slot.hotZone);
      if (!body.photoObjectId) return fail(res, 400, '发布前请上传示意图');
      if (!body.slots?.length) return fail(res, 400, '发布前请生成槽位');
      if (missing.length) return fail(res, 400, '还有槽位没有热区');
    }
    const existing = (await loadAll(TEMPLATE)).find((row) => text(row.id) === req.params.id);
    let id = req.params.id;
    // 平台不接受把可空字段写成 null。从具体分类改成「整单」时重建模版。
    if (!body.materialClassId && existing?.materialClassId) {
      const slots = await loadAll(SLOT, { templateId: id });
      for (const slot of slots) await eadafClient.deleteOne(SLOT, text(slot.id));
      await eadafClient.deleteOne(TEMPLATE, id);
      const created = await eadafClient.create<Row>(TEMPLATE, templateBody(body, status));
      id = text(created.id);
    } else {
      await eadafClient.update(TEMPLATE, id, templateBody(body, status));
    }
    await replaceSlots(id, body.slots ?? []);
    ok(res, { id, status });
  } catch (e) {
    handleError(res, e);
  }
});

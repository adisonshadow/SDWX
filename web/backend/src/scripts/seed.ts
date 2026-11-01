/**
 * 种子数据脚本 — 按已发布的 Create 接口写入 EADAF。
 *
 * 运行: pnpm seed
 *
 * **幂等**：每条记录先按业务编号查一次，存在就跳过并复用它的 id，
 * 重复执行不会堆数据。判重字段：
 *   Workstation.station_code / WbsNode.wbs_code / MeasuringTool.tool_code /
 *   LineStock.stock_code / WorkCard.card_code / InspectionItem.item_code /
 *   WorkStep.step_code；零件与检测记录按 work_card_id 判重。
 *
 * 工位实体写入 IPS。脚本里仍用页面字段名，发出去之前换成 camelCase。
 * 工步仍写 fmms/production/WorkStep。
 *
 * 注意：不要下发 created_at / updated_at，这两个是平台托管字段。
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EADAF_ROUTES } from '@fmms/shared';
import {
  toInspectionItem,
  toInspectionRecord,
  toPart,
  toStock,
  toTool,
  toWbs,
  toWorkCard,
  toWorkstation,
} from '../eadaf/ipsMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env.development 在 web/backend 根目录（scripts 的上两级）
const pkgRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(pkgRoot, '.env.development') });

const base = (process.env.EADAF_API_BASE_URL || 'http://localhost:29526').replace(/\/$/, '');
const appId = process.env.FMMS_APPLICATION_ID;
const secret = process.env.FMMS_APP_SECRET;

/** 种子脚本实体名 → EADAF routePath（含子 Scope） */
const SEED_ENTITY_ROUTES: Record<string, string> = {
  Workstation: EADAF_ROUTES.workstation,
  WbsNode: EADAF_ROUTES.wbsNode,
  MeasuringTool: EADAF_ROUTES.measuringTool,
  LineStock: EADAF_ROUTES.lineStock,
  WorkCard: EADAF_ROUTES.workCard,
  WorkCardPart: EADAF_ROUTES.workCardPart,
  InspectionItem: EADAF_ROUTES.inspectionItem,
  InspectionRecord: EADAF_ROUTES.inspectionRecord,
  WorkStep: EADAF_ROUTES.workStep,
  WorkshopOrder: EADAF_ROUTES.workshopOrder,
  BopInstance: EADAF_ROUTES.bopInstance,
};

async function getToken() {
  const res = await fetch(`${base}/api/v1/applications/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_id: appId, app_secret: secret }),
  });
  const json = (await res.json()) as { data?: { token?: string } };
  return json.data?.token;
}

const FILTER_KEYS: Record<string, Record<string, string>> = {
  Workstation: { station_code: 'stationNo' },
  WbsNode: { wbs_code: 'code' },
  MeasuringTool: { tool_code: 'bizNo' },
  LineStock: { stock_code: 'stockCode' },
  WorkCard: { card_code: 'workCardNo' },
  WorkCardPart: { work_card_id: 'workCardId' },
  InspectionItem: { item_code: 'itemCode' },
  InspectionRecord: { work_card_id: 'workCardId' },
};

function toPayload(entity: string, fields: Record<string, unknown>): Record<string, unknown> {
  switch (entity) {
    case 'Workstation':
      return toWorkstation(fields as never, true);
    case 'WbsNode':
      return toWbs(fields as never, true);
    case 'MeasuringTool':
      return toTool(fields as never, true);
    case 'LineStock':
      return toStock(fields as never);
    case 'WorkCard':
      return toWorkCard(fields as never, true);
    case 'WorkCardPart':
      return toPart(fields as never);
    case 'InspectionItem':
      return toInspectionItem(fields as never, true);
    case 'InspectionRecord':
      return toInspectionRecord(fields as never, true);
    default:
      return fields;
  }
}

function toFilter(entity: string, filter: Record<string, unknown>): Record<string, unknown> {
  const map = FILTER_KEYS[entity];
  if (!map) return filter;
  return Object.fromEntries(Object.entries(filter).map(([key, value]) => [map[key] ?? key, value]));
}

async function create(token: string, entity: string, fields: Record<string, unknown>) {
  const routePath = SEED_ENTITY_ROUTES[entity];
  if (!routePath) throw new Error(`未知种子实体: ${entity}`);
  const payload = toPayload(entity, fields);
  const res = await fetch(`${base}/api/v1/data/${routePath}Create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body: payload }),
  });
  return (await res.json()) as { code: number; message: string; data?: { item?: { id?: string } } };
}

/** 按字段查一条；EADAF 的 Find 支持顶层字段过滤 */
async function findOne(
  token: string,
  entity: string,
  filter: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const routePath = SEED_ENTITY_ROUTES[entity];
  if (!routePath) throw new Error(`未知种子实体: ${entity}`);
  const qs = Object.entries(toFilter(entity, filter))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const res = await fetch(`${base}/api/v1/data/${routePath}Find?${qs}&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    data?: { items?: Record<string, unknown>[]; data?: { items?: Record<string, unknown>[] } };
  };
  const data = json.data?.items ? json.data : (json.data?.data ?? {});
  return (data.items ?? [])[0] ?? null;
}

/** 存在就跳过。创建失败直接中断，不用本地编的 id 去挂后续记录。 */
async function ensure(
  token: string,
  entity: string,
  filter: Record<string, unknown>,
  fields: Record<string, unknown>,
  label: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await findOne(token, entity, filter);
  if (existing?.id) {
    console.log(`  ↺ ${label} 已存在，跳过`);
    return { id: String(existing.id), created: false };
  }
  const r = await create(token, entity, fields);
  const id = r.data?.item?.id;
  if (r.code !== 200 || !id) {
    throw new Error(`${label} 创建失败：${r.message || '平台未返回 id'}`);
  }
  console.log(`  ✓ ${label}`);
  return { id, created: true };
}

async function patch(token: string, entity: string, id: string, body: Record<string, unknown>) {
  const routePath = SEED_ENTITY_ROUTES[entity];
  if (!routePath) throw new Error(`未知种子实体: ${entity}`);
  const res = await fetch(`${base}/api/v1/data/${routePath}Update/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, body }),
  });
  const json = (await res.json()) as { code: number; message: string };
  if (json.code !== 200) throw new Error(`${entity} ${id} 更新失败：${json.message}`);
}

/** 演示工卡挂到已投产、且带维修方案的车间令号上。 */
async function demoRepairLink(token: string) {
  const order = await findOne(token, 'WorkshopOrder', { workshopOrderNo: 'LG-LH-202607001' });
  if (!order?.id || !order.bopSchemeId) {
    throw new Error('找不到已绑定维修方案的车间令号 LG-LH-202607001');
  }
  const instance = await findOne(token, 'BopInstance', { workshopOrderId: String(order.id) });
  if (!instance?.id) throw new Error('车间令号 LG-LH-202607001 没有 BOP 实例');
  return { workshopOrderId: String(order.id), bopInstanceId: String(instance.id) };
}

async function main() {
  const token = await getToken();
  if (!token) throw new Error('token 获取失败');
  console.log('token OK\n');

  const now = new Date().toISOString();
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // ============ 工位 ============
  console.log('=== 工位 ===');
  const stations = [
    { id: id('ws'), station_code: 'OP01', station_name: '分拣工位', station_type: 'sorting', location: 'A区', ip_address: '192.168.1.11', is_active: true },
    { id: id('ws'), station_code: 'OP02-1', station_name: '故检1工位(小件)', station_type: 'inspection_small', location: 'B区', ip_address: '192.168.1.21', is_active: true },
    { id: id('ws'), station_code: 'OP02-2', station_name: '故检2工位(大/小件)', station_type: 'inspection_large', location: 'B区', ip_address: '192.168.1.22', is_active: true },
    { id: id('ws'), station_code: 'OP03', station_name: '修理工位', station_type: 'repair', location: 'C区', ip_address: '192.168.1.31', is_active: true },
    { id: id('ws'), station_code: 'OP04', station_name: '收发工位', station_type: 'receive_send', location: 'D区', ip_address: '192.168.1.41', is_active: true },
  ];
  for (const s of stations) {
    await ensure(token, 'Workstation', { station_code: s.station_code }, { ...s }, `${s.station_code} ${s.station_name}`);
  }

  // ============ WBS 节点 ============
  console.log('\n=== WBS 节点 ===');
  const wbsDefs = [
    { id: id('wbs'), wbs_code: 'WBS-L5-INS-001', wbs_name: '减摆器故检', node_level: 5, sort_order: 1, process_name: '故检工序', process_description: '减摆器各零部件尺寸检测', estimated_minutes: 120, workstation_type: 'inspection_small' },
    { id: id('wbs'), wbs_code: 'WBS-L5-SRT-001', wbs_name: '减摆器分拣', node_level: 5, sort_order: 1, process_name: '分拣工序', estimated_minutes: 60, workstation_type: 'sorting' },
    { id: id('wbs'), wbs_code: 'WBS-L5-REP-001', wbs_name: '减摆器修理', node_level: 5, sort_order: 1, process_name: '修理工序', estimated_minutes: 180, workstation_type: 'repair' },
  ];
  const wbsIds: Record<string, string> = {};
  for (const w of wbsDefs) {
    const r = await ensure(token, 'WbsNode', { wbs_code: w.wbs_code }, { ...w }, `${w.wbs_code} ${w.wbs_name}`);
    wbsIds[w.wbs_code] = r.id;
  }
  const wbsInsId = wbsIds['WBS-L5-INS-001'];
  const wbsSrtId = wbsIds['WBS-L5-SRT-001'];
  const wbsRepId = wbsIds['WBS-L5-REP-001'];

  // ============ 测量工具 ============
  console.log('\n=== 测量工具 ===');
  const tools = [
    { id: id('mt'), tool_code: 'MT-001', tool_name: '数显千分尺', tool_model: '0-25mm/0.001', protocol_type: 'serial', status: 'online', connection_params: { port: '/dev/ttyUSB0', baud_rate: 9600 }, calibration_date: '2026-06-01' },
    { id: id('mt'), tool_code: 'MT-002', tool_name: '气动量仪', tool_model: '高精度', protocol_type: 'modbus_tcp', status: 'online', connection_params: { ip: '192.168.1.100', port: 502 }, calibration_date: '2026-06-15' },
    { id: id('mt'), tool_code: 'MT-003', tool_name: '三坐标测量机', tool_model: 'CMM-500', protocol_type: 'tcp_custom', status: 'offline', connection_params: { ip: '192.168.1.101', port: 8080 }, calibration_date: '2026-05-20' },
  ];
  for (const t of tools) {
    await ensure(token, 'MeasuringTool', { tool_code: t.tool_code }, { ...t }, `${t.tool_code} ${t.tool_name}`);
  }

  // ============ 线边库 ============
  console.log('\n=== 线边库 ===');
  const stocks = [
    { id: id('ls'), stock_code: 'LS-001', stock_name: '待委外缓存区', stock_type: 'outsource_cache', location: 'D区-1', is_active: true },
    { id: id('ls'), stock_code: 'LS-002', stock_name: '零件暂存区', stock_type: 'staging', location: 'D区-2', is_active: true },
    { id: id('ls'), stock_code: 'LS-003', stock_name: '报废区', stock_type: 'scrap', location: 'D区-3', is_active: true },
  ];
  for (const s of stocks) {
    await ensure(token, 'LineStock', { stock_code: s.stock_code }, { ...s }, `${s.stock_code} ${s.stock_name}`);
  }

  // ============ 工卡（每个工位 × 4 种状态）============
  console.log('\n=== 工卡（每工位 4 种状态）===');
  const repairLink = await demoRepairLink(token);
  console.log(`  维修方案令号 ${repairLink.workshopOrderId}`);
  const statuses = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
  const statusLabels = { pending: '待执行', in_progress: '执行中', completed: '已完成', cancelled: '已取消' };
  const operators = ['张伟', '李强', '王芳', '赵明'];

  const stationConfigs = [
    { type: 'sorting', prefix: 'SRT', product: '减摆器组件', wbs: wbsSrtId, parts: 6 },
    { type: 'inspection_small', prefix: 'INS', product: '减摆器(小件)', wbs: wbsInsId, parts: 8 },
    { type: 'inspection_large', prefix: 'INS', product: '减摆器(大件)', wbs: wbsInsId, parts: 5 },
    { type: 'repair', prefix: 'REP', product: '减摆器', wbs: wbsRepId, parts: 4 },
    { type: 'receive_send', prefix: 'RCV', product: '减摆器组件', wbs: undefined, parts: 0 },
  ];

  let counter = 1;
  const createdCards: Array<{ id: string; type: string; parts: number }> = [];
  for (const sc of stationConfigs) {
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const code = `WC-${sc.prefix}-2026-${String(counter++).padStart(3, '0')}`;
      const fields: Record<string, unknown> = {
        id: id('wc'),
        card_code: code,
        card_name: `${sc.product} — ${statusLabels[status]}`,
        station_type: sc.type,
        status,
        product_code: 'P-DBQ-001',
        product_name: sc.product,
        workshop_order_id: repairLink.workshopOrderId,
        bop_instance_id: repairLink.bopInstanceId,
        batch_no: `B2026-${String(counter % 12 + 1).padStart(2, '0')}`,
        serial_no: `SN-${100 + counter}`,
        progress: status === 'in_progress' ? [25, 50, 75][i % 3] : status === 'completed' ? 100 : 0,
        total_parts: sc.parts,
        source: 'seed',
      };
      if (sc.wbs) fields.wbs_node_id = sc.wbs;
      if (status !== 'pending') {
        fields.accept_operator_name = operators[i];
        fields.accept_operator_id = `op-${i + 1}`;
        fields.accept_time = `2026-07-10T0${8 + i}:00:00Z`;
        fields.start_time = `2026-07-10T0${8 + i}:00:00Z`;
      }
      if (status === 'completed') {
        fields.complete_time = `2026-07-10T1${i}:30:00Z`;
        fields.qualified_parts = Math.floor(sc.parts * 0.7);
        fields.unqualified_parts = sc.parts - Math.floor(sc.parts * 0.7);
      }
      const r = await ensure(token, 'WorkCard', { card_code: code }, fields, `${code} | ${sc.type} | ${status}`);
      await patch(token, 'WorkCard', r.id, {
        workshopOrderId: repairLink.workshopOrderId,
        bopInstanceId: repairLink.bopInstanceId,
      });
      console.log(`  ↪ ${code} 已挂维修方案`);
      if (r.id && sc.parts > 0) {
        createdCards.push({ id: r.id, type: sc.type, parts: sc.parts });
      }
    }
  }

  // ============ 检测项（故检工卡用）============
  console.log('\n=== 检测项 ===');
  const insItems = [
    { item_code: 'INS-001', item_name: '外圆直径', measure_tool_code: 'MT-001', nominal_value: 25.0, upper_tolerance: 0.02, lower_tolerance: -0.02, unit: 'mm', sort_order: 1, require_photo: false, inspection_method: 'auto', quality_criteria: '25.00±0.02' },
    { item_code: 'INS-002', item_name: '圆度', measure_tool_code: 'MT-001', nominal_value: 0, upper_tolerance: 0.015, lower_tolerance: 0, unit: 'mm', sort_order: 2, require_photo: false, inspection_method: 'auto', quality_criteria: '≤0.015' },
    { item_code: 'INS-003', item_name: '圆柱度', measure_tool_code: 'MT-001', nominal_value: 0, upper_tolerance: 0.025, lower_tolerance: 0, unit: 'mm', sort_order: 3, require_photo: false, inspection_method: 'auto', quality_criteria: '≤0.025' },
    { item_code: 'INS-004', item_name: '壁厚差', measure_tool_code: 'MT-001', nominal_value: 0, upper_tolerance: 0.03, lower_tolerance: 0, unit: 'mm', sort_order: 4, require_photo: true, inspection_method: 'auto', quality_criteria: '≤0.03' },
    { item_code: 'INS-005', item_name: '活塞杆外圆', measure_tool_code: 'MT-002', nominal_value: 20.0, upper_tolerance: 0.015, lower_tolerance: -0.015, unit: 'mm', sort_order: 5, require_photo: false, inspection_method: 'auto', quality_criteria: '20.00±0.015' },
    { item_code: 'INS-006', item_name: '密封槽真圆度', measure_tool_code: 'MT-002', nominal_value: 0, upper_tolerance: 0.01, lower_tolerance: 0, unit: 'mm', sort_order: 6, require_photo: false, inspection_method: 'auto', quality_criteria: '≤0.01' },
    { item_code: 'INS-007', item_name: '表面裂纹检查', measure_tool_code: undefined, sort_order: 7, require_photo: true, inspection_method: 'manual', quality_criteria: '目视无裂纹' },
  ];
  for (const it of insItems) {
    await ensure(
      token,
      'InspectionItem',
      { item_code: it.item_code },
      { id: id('ii'), wbs_node_id: wbsInsId, ...it },
      `${it.item_code} ${it.item_name}`,
    );
  }

  // ============ 工步（故检 WBS）============
  console.log('\n=== 工步 ===');
  const steps = [
    { step_code: 'STEP-001', step_name: '外观检查', operation_content: '目视检查零件表面', sort_order: 1 },
    { step_code: 'STEP-002', step_name: '尺寸测量', operation_content: '按检测项逐项测量', sort_order: 2 },
  ];
  for (const s of steps) {
    await ensure(
      token,
      'WorkStep',
      { step_code: s.step_code },
      { id: id('ws'), wbs_node_id: wbsInsId, ...s },
      `${s.step_code} ${s.step_name}`,
    );
  }

  // ============ 工卡零部件 ============
  console.log('\n=== 工卡零部件 ===');
  const partNames = ['活塞杆', '密封圈', '导向套', '阀体', '弹簧', '垫片', '螺母', '螺栓'];
  for (const card of createdCards) {
    if (await findOne(token, 'WorkCardPart', { work_card_id: card.id })) {
      console.log(`  ↺ ${card.id.slice(0, 12)}… 零件已存在，跳过`);
      continue;
    }
    for (let i = 0; i < card.parts; i++) {
      const partCode = `P-${card.type.toUpperCase().slice(0, 3)}-${String(i + 1).padStart(3, '0')}`;
      const r = await create(token, 'WorkCardPart', {
        id: id('wcp'),
        work_card_id: card.id,
        part_code: partCode,
        part_name: partNames[i % partNames.length],
        quantity: 1,
        status: 'pending',
        sort_order: i + 1,
      });
      console.log(`  ${r.code === 200 ? '✓' : '✗'} ${partCode} → ${card.id.slice(0, 8)}`);
    }
  }

  // ============ 检测记录样例 ============
  console.log('\n=== 检测记录样例 ===');
  const processingInsCard = createdCards.find((c) => c.type === 'inspection_small');
  if (processingInsCard) {
    if (await findOne(token, 'InspectionRecord', { work_card_id: processingInsCard.id })) {
      console.log('  ↺ 该工卡已有检测记录，跳过');
    } else {
      const sampleResults = [
        { item_code: 'INS-001', result: 'qualified', measured_value: 25.01 },
        { item_code: 'INS-002', result: 'qualified', measured_value: 0.012 },
      ];
      for (const sr of sampleResults) {
        const item = await findOne(token, 'InspectionItem', { item_code: sr.item_code });
        const r = await create(token, 'InspectionRecord', {
          id: id('ir'),
          work_card_id: processingInsCard.id,
          inspection_item_id: item?.id,
          result: sr.result,
          measured_value: sr.measured_value,
          inspect_time: now,
        });
        console.log(`  ${r.code === 200 ? '✓' : '✗'} ${sr.item_code} ${sr.result}`);
      }
    }
  }

  console.log('\n=== 种子数据写入完成（重复执行不会新增） ===');
}

main().catch((e) => { console.error(e); process.exit(1); });

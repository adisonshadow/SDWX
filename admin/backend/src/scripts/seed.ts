/**
 * 种子数据脚本 — 向 EADAF 写入 Mock 种子数据
 *
 * 运行: pnpm seed
 * EADAF API 实际格式（对齐 applications-public/FMMS/apis.json）：
 *   Create: POST /api/v1/data/fmms/{scope}/{Entity}Create  body: { body: { id, ...字段 } }
 *   Find:   GET  /api/v1/data/fmms/{scope}/{Entity}Find?limit=N
 *   Update: PATCH /api/v1/data/fmms/{scope}/{Entity}Update/:id  body: { id, body: {...} }
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EADAF_ROUTES } from '@fmms/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env.development 在 admin/backend 根目录（scripts 的上两级）
const pkgRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(pkgRoot, '.env.development') });

const base = (process.env.EADAF_API_BASE_URL || 'http://localhost:9527').replace(/\/$/, '');
const appId = process.env.FMMS_APPLICATION_ID;
const secret = process.env.FMMS_APP_SECRET;

/** 种子脚本实体名 → EADAF routePath（含子 Scope） */
const SEED_ENTITY_ROUTES: Record<string, string> = {
  Workstation: EADAF_ROUTES.workstation,
  WbsNode: EADAF_ROUTES.wbsNode,
  MeasuringTool: EADAF_ROUTES.measuringTool,
  LineStock: EADAF_ROUTES.lineStock,
  WorkCard: EADAF_ROUTES.workCard,
  InspectionItem: EADAF_ROUTES.inspectionItem,
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

async function create(token: string, entity: string, fields: Record<string, unknown>) {
  const routePath = SEED_ENTITY_ROUTES[entity];
  if (!routePath) throw new Error(`未知种子实体: ${entity}`);
  const res = await fetch(`${base}/api/v1/data/${routePath}Create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body: fields }),
  });
  return (await res.json()) as { code: number; message: string };
}

async function main() {
  const token = await getToken();
  if (!token) throw new Error('token 获取失败');
  console.log('token OK\n');

  const now = new Date().toISOString();
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // ============ 工位 ============
  console.log('=== 创建工位 ===');
  const stations = [
    { id: id('ws'), station_code: 'OP01', station_name: '分拣工位', station_type: 'sorting', location: 'A区', ip_address: '192.168.1.11', is_active: true },
    { id: id('ws'), station_code: 'OP02-1', station_name: '故检1工位(小件)', station_type: 'inspection_small', location: 'B区', ip_address: '192.168.1.21', is_active: true },
    { id: id('ws'), station_code: 'OP02-2', station_name: '故检2工位(大/小件)', station_type: 'inspection_large', location: 'B区', ip_address: '192.168.1.22', is_active: true },
    { id: id('ws'), station_code: 'OP03', station_name: '修理工位', station_type: 'repair', location: 'C区', ip_address: '192.168.1.31', is_active: true },
    { id: id('ws'), station_code: 'OP04', station_name: '收发工位', station_type: 'receive_send', location: 'D区', ip_address: '192.168.1.41', is_active: true },
  ];
  for (const s of stations) {
    const r = await create(token, 'Workstation', { ...s, created_at: now, updated_at: now });
    console.log(`  ${r.code === 200 ? '✓' : '✗'} ${s.station_code} ${s.station_name}`);
  }

  // ============ WBS 节点 ============
  console.log('\n=== 创建 WBS 节点 ===');
  const wbsInsId = id('wbs');
  const wbsSrtId = id('wbs');
  const wbsRepId = id('wbs');
  const wbsNodes = [
    { id: wbsInsId, wbs_code: 'WBS-L5-INS-001', wbs_name: '减摆器故检', node_level: 5, sort_order: 1, process_name: '故检工序', process_description: '减摆器各零部件尺寸检测', estimated_minutes: 120, workstation_type: 'inspection_small' },
    { id: wbsSrtId, wbs_code: 'WBS-L5-SRT-001', wbs_name: '减摆器分拣', node_level: 5, sort_order: 1, process_name: '分拣工序', estimated_minutes: 60, workstation_type: 'sorting' },
    { id: wbsRepId, wbs_code: 'WBS-L5-REP-001', wbs_name: '减摆器修理', node_level: 5, sort_order: 1, process_name: '修理工序', estimated_minutes: 180, workstation_type: 'repair' },
  ];
  for (const w of wbsNodes) {
    const r = await create(token, 'WbsNode', { ...w, created_at: now, updated_at: now });
    console.log(`  ${r.code === 200 ? '✓' : '✗'} ${w.wbs_code} ${w.wbs_name}`);
  }

  // ============ 测量工具 ============
  console.log('\n=== 创建测量工具 ===');
  const tools = [
    { id: id('mt'), tool_code: 'MT-001', tool_name: '数显千分尺', tool_model: '0-25mm/0.001', protocol_type: 'serial', status: 'online', connection_params: { port: '/dev/ttyUSB0', baud_rate: 9600 }, calibration_date: '2026-06-01' },
    { id: id('mt'), tool_code: 'MT-002', tool_name: '气动量仪', tool_model: '高精度', protocol_type: 'modbus_tcp', status: 'online', connection_params: { ip: '192.168.1.100', port: 502 }, calibration_date: '2026-06-15' },
    { id: id('mt'), tool_code: 'MT-003', tool_name: '三坐标测量机', tool_model: 'CMM-500', protocol_type: 'tcp_custom', status: 'offline', connection_params: { ip: '192.168.1.101', port: 8080 }, calibration_date: '2026-05-20' },
  ];
  for (const t of tools) {
    const r = await create(token, 'MeasuringTool', { ...t, created_at: now, updated_at: now });
    console.log(`  ${r.code === 200 ? '✓' : '✗'} ${t.tool_code} ${t.tool_name}`);
  }

  // ============ 线边库 ============
  console.log('\n=== 创建线边库 ===');
  const stocks = [
    { id: id('ls'), stock_code: 'LS-001', stock_name: '待委外缓存区', stock_type: 'outsource_cache', location: 'D区-1', is_active: true },
    { id: id('ls'), stock_code: 'LS-002', stock_name: '零件暂存区', stock_type: 'staging', location: 'D区-2', is_active: true },
    { id: id('ls'), stock_code: 'LS-003', stock_name: '报废区', stock_type: 'scrap', location: 'D区-3', is_active: true },
  ];
  for (const s of stocks) {
    const r = await create(token, 'LineStock', { ...s, created_at: now, updated_at: now });
    console.log(`  ${r.code === 200 ? '✓' : '✗'} ${s.stock_code} ${s.stock_name}`);
  }

  // ============ 工卡（每个工位 × 4 种状态）============
  console.log('\n=== 创建工卡（每工位 4 种状态）===');
  const statuses = ['unaccepted', 'pending', 'processing', 'completed'] as const;
  const statusLabels = { unaccepted: '新任务', pending: '待处理', processing: '进行中', completed: '已完成' };
  const operators = ['张伟', '李强', '王芳', '赵明'];

  const stationConfigs = [
    { type: 'sorting', prefix: 'SRT', product: '减摆器组件', wbs: wbsSrtId, parts: 6 },
    { type: 'inspection_small', prefix: 'INS', product: '减摆器(小件)', wbs: wbsInsId, parts: 8 },
    { type: 'inspection_large', prefix: 'INS', product: '减摆器(大件)', wbs: wbsInsId, parts: 5 },
    { type: 'repair', prefix: 'REP', product: '减摆器', wbs: wbsRepId, parts: 4 },
    { type: 'receive_send', prefix: 'RCV', product: '减摆器组件', wbs: undefined, parts: 0 },
  ];

  let counter = 1;
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
        batch_no: `B2026-${String(counter % 12 + 1).padStart(2, '0')}`,
        serial_no: `SN-${100 + counter}`,
        progress: status === 'processing' ? [25, 50, 75][i % 3] : status === 'completed' ? 100 : 0,
        total_parts: sc.parts,
        source: 'mock',
      };
      if (sc.wbs) fields.wbs_node_id = sc.wbs;
      if (status !== 'unaccepted') {
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
      const r = await create(token, 'WorkCard', { ...fields, created_at: now, updated_at: now });
      console.log(`  ${r.code === 200 ? '✓' : '✗'} ${code} | ${sc.type} | ${status}`);
    }
  }

  // ============ 检测项（故检工卡用）============
  console.log('\n=== 创建检测项 ===');
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
    const r = await create(token, 'InspectionItem', { id: id('ii'), wbs_node_id: wbsInsId, ...it, created_at: now, updated_at: now });
    console.log(`  ${r.code === 200 ? '✓' : '✗'} ${it.item_code} ${it.item_name}`);
  }

  console.log('\n=== 种子数据写入完成 ===');
}

main().catch((e) => { console.error(e); process.exit(1); });

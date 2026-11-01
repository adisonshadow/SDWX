/**
 * Seed 脚本 — 向 EADAF 写入 IPS 演示数据
 *
 * 依据：
 * - docs/车间通用业务和维修方案的描述.md
 * - docs/修理车间智能排产模块 需求分析与功能架构.md
 * - docs/单台计划 WBS 完整示例.md
 *
 * 幂等：按业务编号 find，存在则跳过，不存在则 create。
 * 区位/工站：不新增工位。故检修理线绑定已有 F01~F05；WS-DIS-01/WS-INS-01 仅历史幂等保底。
 *
 * 用法：pnpm --filter @ips/backend run seed
 */
import { eadafClient } from '../eadaf/EADAFClient.js';
import { EADAF_ROUTES } from '@ips/shared';
import type {
  Product,
  BopScheme,
  BomScheme,
  FactoryOrder,
  WorkshopOrder,
  Workstation,
  ProcessOperation,
  BopInstance,
  SingleUnitPlan,
  WorkCard,
  WbsNode,
  Material,
} from '@ips/shared';

const R = EADAF_ROUTES;

function log(msg: string): void {
  console.log(`[seed] ${msg}`);
}

/** 幂等创建：按 filter 查，存在返回，否则创建 */
async function idempotentCreate<T extends { id?: string }>(
  routePath: string,
  filter: Record<string, unknown>,
  body: Record<string, unknown>,
  label: string,
): Promise<T> {
  const existing = await eadafClient.findFiltered<T>(routePath, filter, { limit: 1 });
  if (existing.items[0]) {
    log(`跳过（已存在）: ${label}`);
    return existing.items[0];
  }
  // EADAF 对部分字段拒绝 null（期望 string/number），创建前剔除空值
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== null && v !== undefined) cleaned[k] = v;
  }
  const created = await eadafClient.create<T>(routePath, cleaned, false);
  log(`创建: ${label} → id=${created.id}`);
  return created;
}

/** 工作日偏移（跳过周末，对齐排期默认「周日不可排」） */
function workdayOffset(baseIso: string, offset: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  let left = offset;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  while (left < 0) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left += 1;
  }
  return d.toISOString().slice(0, 10);
}

type StationKey = 'DIS' | 'SORT' | 'INS' | 'INS2' | 'REP' | 'IO' | 'SPARE';

type OpDef = {
  operationNo: string;
  name: string;
  standardHours: number;
  kitRequired: boolean;
  category: 'ROUTINE' | 'NON_ROUTINE';
  /**
   * 工位键 → 查询已有工位，不新建：
   * DIS→WS-DIS-01；SORT→F01；INS→F02；INS2→F03；REP→F04；IO/SPARE→F05
   */
  station: StationKey;
};

/** 对齐 WBS 完整示例的例行/非例行工序库 */
const OP_DEFS: OpDef[] = [
  { operationNo: 'OP-REC-001', name: '履历本、适航文件有效性核查', standardHours: 2, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-REC-002', name: '起落架整机目视初检、缺陷标记记录', standardHours: 3, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-TEC-001', name: '大修标准BOP加载、工序实例化、齐套规则配置', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-DISASSEMBLY-01', name: '起落架全系统放油、废液收集密封处理', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-DIS-002', name: '收放作动筒、位置传感器、安全锁拆解标识', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-DIS-003', name: '主起落架支柱筒体与活塞组件拆分', standardHours: 6, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-DIS-004', name: '扭力臂、接头、轮轴分离分类存放', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-WASH-001', name: '支柱筒体、大接头超声波粗洗除油除漆', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-WASH-002', name: '一级零件、销轴、衬套清洗干燥防护', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-INSPECT-01', name: '腐蚀、划伤、裂纹目视筛查缺陷记录', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'INS' },
  { operationNo: 'OP-NDT-001', name: '关键受力件荧光渗透PT检测', standardHours: 6, kitRequired: true, category: 'ROUTINE', station: 'INS2' },
  { operationNo: 'OP-NDT-002', name: '薄壁构件涡流ET探伤', standardHours: 4, kitRequired: true, category: 'ROUTINE', station: 'INS2' },
  { operationNo: 'OP-MET-001', name: '配合间隙、轴径、衬套磨损量计量检测', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'SORT' },
  { operationNo: 'OP-REP-001', name: '腐蚀坑、表面划伤打磨、机加去除损伤', standardHours: 8, kitRequired: true, category: 'ROUTINE', station: 'REP' },
  { operationNo: 'OP-OUT-001', name: '旧镀层退除、重新电镀防腐涂层', standardHours: 16, kitRequired: true, category: 'ROUTINE', station: 'IO' },
  { operationNo: 'OP-KIT-001', name: '全部封严圈、轴承衬套、缓冲密封换新', standardHours: 4, kitRequired: true, category: 'ROUTINE', station: 'SPARE' },
  { operationNo: 'OP-ASM-001', name: '活塞、隔套、缓冲弹簧内部组装', standardHours: 6, kitRequired: true, category: 'ROUTINE', station: 'REP' },
  { operationNo: 'OP-ASM-002', name: '扭力臂铰接、轮轴衬套压装、力矩紧固', standardHours: 6, kitRequired: true, category: 'ROUTINE', station: 'REP' },
  { operationNo: 'OP-ASM-003', name: '作动筒、传感器、锁机构管路装配', standardHours: 6, kitRequired: true, category: 'ROUTINE', station: 'REP' },
  { operationNo: 'OP-ASM-004', name: '缓冲油加注、氮气充压、压力静态保压', standardHours: 4, kitRequired: true, category: 'ROUTINE', station: 'REP' },
  { operationNo: 'OP-TST-001', name: '全管路加压渗漏检查、泄漏缺陷处理', standardHours: 6, kitRequired: false, category: 'ROUTINE', station: 'INS' },
  { operationNo: 'OP-TST-002', name: '起落架收放循环试验、锁止功能验证', standardHours: 8, kitRequired: false, category: 'ROUTINE', station: 'INS' },
  { operationNo: 'OP-TST-003', name: '大修全项符合性检查、检验签字确认', standardHours: 4, kitRequired: false, category: 'ROUTINE', station: 'INS' },
  { operationNo: 'OP-NR-001', name: '裂纹件返修、复探复检', standardHours: 8, kitRequired: true, category: 'NON_ROUTINE', station: 'REP' },
  { operationNo: 'OP-NR-002', name: '密封拆解更换、重新试压', standardHours: 6, kitRequired: true, category: 'NON_ROUTINE', station: 'REP' },
  { operationNo: 'OP-FIN-001', name: '接口封堵、防锈油喷涂、转运支架固定', standardHours: 3, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
  { operationNo: 'OP-FIN-002', name: '工卡、NDT报告、试验记录装订归档', standardHours: 2, kitRequired: false, category: 'ROUTINE', station: 'DIS' },
];

type LeafSpec = {
  code: string;
  name: string;
  operationNo: string;
  /** 相对 planStart 的工作日偏移 */
  dayOffset: number;
  half: 'AM' | 'PM';
  status: string;
  isRoutine: boolean;
  kitRequired: boolean;
  priority: 'ROUTINE' | 'NON_ROUTINE' | 'URGENT';
  pipelineOrder?: number;
  occupiesPipeline?: boolean;
};

/** 对齐 docs/单台计划 WBS 完整示例 的底层工卡任务 */
const LEAF_SPECS: LeafSpec[] = [
  { code: '1.01.01.01', name: '履历本、适航文件有效性核查', operationNo: 'OP-REC-001', dayOffset: 0, half: 'AM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.01.02.01', name: '起落架整机目视初检、缺陷标记记录', operationNo: 'OP-REC-002', dayOffset: 0, half: 'PM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.01.03.01', name: '大修标准BOP加载、工序实例化、齐套规则配置', operationNo: 'OP-TEC-001', dayOffset: 1, half: 'AM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.02.01.01', name: '起落架全系统放油、废液收集密封处理', operationNo: 'OP-DISASSEMBLY-01', dayOffset: 1, half: 'PM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.02.02.01', name: '收放作动筒、位置传感器、安全锁拆解标识', operationNo: 'OP-DIS-002', dayOffset: 2, half: 'AM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.02.03.01', name: '主起落架支柱筒体与活塞组件拆分', operationNo: 'OP-DIS-003', dayOffset: 2, half: 'PM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.02.03.02', name: '扭力臂、接头、轮轴分离分类存放', operationNo: 'OP-DIS-004', dayOffset: 3, half: 'AM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.03.01.01', name: '支柱筒体、大接头超声波粗洗除油除漆', operationNo: 'OP-WASH-001', dayOffset: 3, half: 'PM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.03.02.01', name: '一级零件、销轴、衬套清洗干燥防护', operationNo: 'OP-WASH-002', dayOffset: 4, half: 'AM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.04.01.01', name: '腐蚀、划伤、裂纹目视筛查缺陷记录', operationNo: 'OP-INSPECT-01', dayOffset: 4, half: 'PM', status: 'REPAIR_DONE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.04.02.01', name: '关键受力件荧光渗透PT检测', operationNo: 'OP-NDT-001', dayOffset: 5, half: 'AM', status: 'REPAIRING', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
  { code: '1.04.02.02', name: '薄壁构件涡流ET探伤', operationNo: 'OP-NDT-002', dayOffset: 5, half: 'PM', status: 'PENDING_ACCEPT', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 2, occupiesPipeline: true },
  { code: '1.04.03.01', name: '配合间隙、轴径、衬套磨损量计量检测', operationNo: 'OP-MET-001', dayOffset: 6, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.05.01.01', name: '腐蚀坑、表面划伤打磨、机加去除损伤', operationNo: 'OP-REP-001', dayOffset: 7, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  { code: '1.05.02.01', name: '旧镀层退除、重新电镀防腐涂层', operationNo: 'OP-OUT-001', dayOffset: 8, half: 'AM', status: 'KIT_SUSPENDED', isRoutine: true, kitRequired: true, priority: 'ROUTINE', occupiesPipeline: false },
  { code: '1.05.03.01', name: '全部封严圈、轴承衬套、缓冲密封换新', operationNo: 'OP-KIT-001', dayOffset: 9, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  { code: '1.06.01.01', name: '活塞、隔套、缓冲弹簧内部组装', operationNo: 'OP-ASM-001', dayOffset: 10, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  { code: '1.06.02.01', name: '扭力臂铰接、轮轴衬套压装、力矩紧固', operationNo: 'OP-ASM-002', dayOffset: 11, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  { code: '1.06.03.01', name: '作动筒、传感器、锁机构管路装配', operationNo: 'OP-ASM-003', dayOffset: 12, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  { code: '1.07.01.01', name: '缓冲油加注、氮气充压、压力静态保压', operationNo: 'OP-ASM-004', dayOffset: 13, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  { code: '1.08.01.01', name: '全管路加压渗漏检查、泄漏缺陷处理', operationNo: 'OP-TST-001', dayOffset: 14, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.08.02.01', name: '起落架收放循环试验、锁止功能验证', operationNo: 'OP-TST-002', dayOffset: 15, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.08.03.01', name: '大修全项符合性检查、检验签字确认', operationNo: 'OP-TST-003', dayOffset: 16, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.09.01.01', name: '裂纹件返修、复探复检', operationNo: 'OP-NR-001', dayOffset: 5, half: 'AM', status: 'PENDING_ACCEPT', isRoutine: false, kitRequired: true, priority: 'URGENT', pipelineOrder: 0, occupiesPipeline: true },
  { code: '1.09.02.01', name: '密封拆解更换、重新试压', operationNo: 'OP-NR-002', dayOffset: 14, half: 'PM', status: 'PENDING_EFFECTIVE', isRoutine: false, kitRequired: true, priority: 'NON_ROUTINE' },
  { code: '1.10.01.01', name: '接口封堵、防锈油喷涂、转运支架固定', operationNo: 'OP-FIN-001', dayOffset: 17, half: 'AM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
  { code: '1.10.02.01', name: '工卡、NDT报告、试验记录装订归档', operationNo: 'OP-FIN-002', dayOffset: 17, half: 'PM', status: 'PENDING_EFFECTIVE', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
];

type PhaseDef = { code: string; name: string; packages: { code: string; name: string; leaves: string[] }[] };

const WBS_PHASES: PhaseDef[] = [
  {
    code: '1.01',
    name: '入厂接收与项目技术准备',
    packages: [
      { code: '1.01.01', name: '产品履历与维修资料核对', leaves: ['1.01.01.01'] },
      { code: '1.01.02', name: '入厂外观初检与故障信息采集', leaves: ['1.01.02.01'] },
      { code: '1.01.03', name: '维修方案BOP实例化与工卡生成', leaves: ['1.01.03.01'] },
    ],
  },
  {
    code: '1.02',
    name: '整机放油与总成分解作业',
    packages: [
      { code: '1.02.01', name: '液压油、缓冲介质排放', leaves: ['1.02.01.01'] },
      { code: '1.02.02', name: '外部附件、传感器、锁机构拆卸', leaves: ['1.02.02.01'] },
      { code: '1.02.03', name: '主支柱、扭力臂、轮轴总成拆解', leaves: ['1.02.03.01', '1.02.03.02'] },
    ],
  },
  {
    code: '1.03',
    name: '零部件清洗转运',
    packages: [
      { code: '1.03.01', name: '大型结构件粗洗', leaves: ['1.03.01.01'] },
      { code: '1.03.02', name: '小型零件、衬套、密封件精洗', leaves: ['1.03.02.01'] },
    ],
  },
  {
    code: '1.04',
    name: '故障检测与无损探伤',
    packages: [
      { code: '1.04.01', name: '全零部件目视VT检查', leaves: ['1.04.01.01'] },
      { code: '1.04.02', name: '无损NDT检测（PT/ET）', leaves: ['1.04.02.01', '1.04.02.02'] },
      { code: '1.04.03', name: '尺寸计量与磨损测量', leaves: ['1.04.03.01'] },
    ],
  },
  {
    code: '1.05',
    name: '零部件修复与表面处理',
    packages: [
      { code: '1.05.01', name: '机械损伤机加修复', leaves: ['1.05.01.01'] },
      { code: '1.05.02', name: '表面镀层/喷涂修复', leaves: ['1.05.02.01'] },
      { code: '1.05.03', name: '易损件更换', leaves: ['1.05.03.01'] },
    ],
  },
  {
    code: '1.06',
    name: '起落架总成装配',
    packages: [
      { code: '1.06.01', name: '支柱内部缓冲组件预装', leaves: ['1.06.01.01'] },
      { code: '1.06.02', name: '扭力臂、轮轴、接头装配', leaves: ['1.06.02.01'] },
      { code: '1.06.03', name: '外部附件回装', leaves: ['1.06.03.01'] },
    ],
  },
  {
    code: '1.07',
    name: '缓冲充油、氮气充压调试',
    packages: [{ code: '1.07.01', name: '介质加注与充气校验', leaves: ['1.07.01.01'] }],
  },
  {
    code: '1.08',
    name: '整机功能试验',
    packages: [
      { code: '1.08.01', name: '液压密封性耐压试验', leaves: ['1.08.01.01'] },
      { code: '1.08.02', name: '多次收放循环功能试验', leaves: ['1.08.02.01'] },
      { code: '1.08.03', name: '整机终检符合性验收', leaves: ['1.08.03.01'] },
    ],
  },
  {
    code: '1.09',
    name: '异常返工/追加排故工序',
    packages: [
      { code: '1.09.01', name: '探伤不合格返工修复', leaves: ['1.09.01.01'] },
      { code: '1.09.02', name: '装配渗漏返工处理', leaves: ['1.09.02.01'] },
    ],
  },
  {
    code: '1.10',
    name: '出厂防护、资料归档交付',
    packages: [
      { code: '1.10.01', name: '整机防锈封堵与包装防护', leaves: ['1.10.01.01'] },
      { code: '1.10.02', name: '维修履历全套资料归档', leaves: ['1.10.02.01'] },
    ],
  },
];

async function main(): Promise<void> {
  log('获取 EADAF token ...');
  await eadafClient.getToken();
  log('token 获取成功 ✓\n');

  const planStart = '2026-07-06';
  const planEnd = '2026-08-07';

  // ─────────────────────────────────────────
  // 1. 产品
  // ─────────────────────────────────────────
  const product = await idempotentCreate<Product>(
    R.product,
    { productNo: 'LG-A320' },
    {
      productNo: 'LG-A320',
      name: 'A320 主起落架',
      model: 'A320',
      batchSerial: 'B-2024-001',
      historyBookNo: 'HB-LG-001',
    },
    '产品 LG-A320',
  );

  const productNose = await idempotentCreate<Product>(
    R.product,
    { productNo: 'LG-A320-NLG' },
    {
      productNo: 'LG-A320-NLG',
      name: 'A320 前起落架',
      model: 'A320',
      batchSerial: 'B-2024-002',
      historyBookNo: 'HB-LG-002',
    },
    '产品 LG-A320-NLG',
  );

  // ─────────────────────────────────────────
  // 2. 物料（BOM 支撑）
  // ─────────────────────────────────────────
  const matRoot = await idempotentCreate<Material>(
    R.material,
    { materialNo: 'MAT-LG-A320-MLG' },
    {
      materialNo: 'MAT-LG-A320-MLG',
      name: 'A320 主起落架总成',
      nodeType: 'LANDING_GEAR',
      independentRepair: true,
    },
    '物料 主起落架总成',
  );
  const matMajor = await idempotentCreate<Material>(
    R.material,
    { materialNo: 'MAT-LG-STRUT' },
    {
      materialNo: 'MAT-LG-STRUT',
      name: '主支柱筒体总成',
      nodeType: 'MAJOR_ASSEMBLY',
      independentRepair: true,
    },
    '物料 主支柱',
  );
  const matPrimary = await idempotentCreate<Material>(
    R.material,
    { materialNo: 'MAT-LG-PIN' },
    {
      materialNo: 'MAT-LG-PIN',
      name: '连接销轴（一级零件）',
      nodeType: 'PRIMARY_PART',
      independentRepair: false,
    },
    '物料 销轴',
  );
  const matSeal = await idempotentCreate<Material>(
    R.material,
    { materialNo: 'MAT-LG-SEAL' },
    {
      materialNo: 'MAT-LG-SEAL',
      name: '缓冲密封圈组',
      nodeType: 'PART_SMALL',
      independentRepair: false,
    },
    '物料 密封圈',
  );
  const matPlate = await idempotentCreate<Material>(
    R.material,
    { materialNo: 'MAT-LG-PLATE' },
    {
      materialNo: 'MAT-LG-PLATE',
      name: '电镀协作件',
      nodeType: 'COLLABORATION',
      independentRepair: false,
    },
    '物料 电镀协作件',
  );

  // ─────────────────────────────────────────
  // 3. 工序定义（可复用）
  // ─────────────────────────────────────────
  const opsByNo = new Map<string, ProcessOperation>();
  for (const def of OP_DEFS) {
    const op = await idempotentCreate<ProcessOperation>(
      R.processOperation,
      { operationNo: def.operationNo },
      {
        operationNo: def.operationNo,
        name: def.name,
        version: 1,
        versionStatus: 'PUBLISHED',
        category: def.category,
        standardHours: String(def.standardHours),
        kitRequired: def.kitRequired,
      },
      `工序 ${def.operationNo} ${def.name}`,
    );
    opsByNo.set(def.operationNo, op);
  }

  // 工序工步 / DAG 边 / 物料挂载
  // EADAF ProcessStep 的 isInspectionPoint / isMandatoryInspection 为必填，必须显式传 true/false（不可省略）
  async function seedOperationStructure(
    op: ProcessOperation,
    mats: { seal?: Material; plate?: Material; pin?: Material },
  ) {
    if (!op.id) return;
    const s01 = await idempotentCreate(
      R.processStep,
      { operationId: op.id, stepNo: 'S01' },
      {
        operationId: op.id,
        stepNo: 'S01',
        sortOrder: 1,
        name: '作业准备与工艺确认',
        isInspectionPoint: false,
        isMandatoryInspection: false,
        standardHours: '0.5',
      },
      `工步 ${op.operationNo}/S01`,
    );
    const s02 = await idempotentCreate(
      R.processStep,
      { operationId: op.id, stepNo: 'S02' },
      {
        operationId: op.id,
        stepNo: 'S02',
        sortOrder: 2,
        name: '主作业执行',
        isInspectionPoint: false,
        isMandatoryInspection: false,
        standardHours: String(Math.max(1, Number(op.standardHours || 4) - 1)),
      },
      `工步 ${op.operationNo}/S02`,
    );
    const s03 = await idempotentCreate(
      R.processStep,
      { operationId: op.id, stepNo: 'S03' },
      {
        operationId: op.id,
        stepNo: 'S03',
        sortOrder: 3,
        name: op.kitRequired ? '强制检验放行' : '完工自检',
        isInspectionPoint: true,
        isMandatoryInspection: !!op.kitRequired,
        inspectionSpec: op.kitRequired
          ? '齐套核对 + 外观/尺寸合格签字'
          : '自检无异常缺陷后报完工',
        standardHours: '0.5',
      },
      `工步 ${op.operationNo}/S03`,
    );
    if (s01.id && s02.id) {
      await idempotentCreate(
        R.processStepEdge,
        { fromStepId: s01.id, toStepId: s02.id },
        { fromStepId: s01.id, toStepId: s02.id, edgeType: 'NORMAL' },
        `工步边 ${op.operationNo} S01→S02`,
      );
    }
    if (s02.id && s03.id) {
      await idempotentCreate(
        R.processStepEdge,
        { fromStepId: s02.id, toStepId: s03.id, edgeType: 'NORMAL' },
        { fromStepId: s02.id, toStepId: s03.id, edgeType: 'NORMAL' },
        `工步边 ${op.operationNo} S02→S03`,
      );
      // 检验不合格回流至主作业
      await idempotentCreate(
        R.processStepEdge,
        { fromStepId: s03.id, toStepId: s02.id, edgeType: 'FAIL' },
        { fromStepId: s03.id, toStepId: s02.id, edgeType: 'FAIL' },
        `工步边 ${op.operationNo} S03→S02 FAIL`,
      );
    }

    // 物料挂载：齐套性工序挂密封件；委外/电镀挂协作件；装配类挂销轴
    if (mats.seal?.id && (op.kitRequired || op.operationNo.startsWith('OP-KIT') || op.operationNo.startsWith('OP-ASM'))) {
      await idempotentCreate(
        R.processOperationMaterial,
        { operationId: op.id, materialId: mats.seal.id },
        {
          operationId: op.id,
          materialId: mats.seal.id,
          quantity: op.operationNo.startsWith('OP-KIT') ? 12 : 2,
          isCollaboration: false,
          kitCheck: !!op.kitRequired,
        },
        `工序物料 ${op.operationNo}/密封圈`,
      );
    }
    if (mats.plate?.id && (op.operationNo.startsWith('OP-OUT') || op.operationNo.startsWith('OP-REP'))) {
      await idempotentCreate(
        R.processOperationMaterial,
        { operationId: op.id, materialId: mats.plate.id },
        {
          operationId: op.id,
          materialId: mats.plate.id,
          quantity: 1,
          isCollaboration: true,
          kitCheck: true,
        },
        `工序物料 ${op.operationNo}/电镀协作件`,
      );
    }
    if (mats.pin?.id && (op.operationNo.startsWith('OP-ASM') || op.operationNo.startsWith('OP-DIS'))) {
      await idempotentCreate(
        R.processOperationMaterial,
        { operationId: op.id, materialId: mats.pin.id },
        {
          operationId: op.id,
          materialId: mats.pin.id,
          quantity: 4,
          isCollaboration: false,
          kitCheck: false,
        },
        `工序物料 ${op.operationNo}/销轴`,
      );
    }
  }

  for (const op of opsByNo.values()) {
    await seedOperationStructure(op, {
      seal: matSeal,
      plate: matPlate,
      pin: matPrimary,
    });
  }

  // ─────────────────────────────────────────
  // 4. BOM 方案 + 节点
  // ─────────────────────────────────────────
  const bomScheme = await idempotentCreate<BomScheme>(
    R.bomScheme,
    { productModel: 'A320', versionStatus: 'PUBLISHED' },
    {
      productModel: 'A320',
      version: 1,
      versionStatus: 'PUBLISHED',
      name: 'A320 主起落架 BOM',
    },
    'BOM 方案 A320',
  );
  // BOM 节点（quantity 已与 EADAF 对齐）
  let bomRootNodeId: string | undefined;
  if (bomScheme.id && matRoot.id) {
    const rootNode = await idempotentCreate(
      R.bomSchemeNode,
      { bomSchemeId: bomScheme.id, nodeType: 'LANDING_GEAR', materialId: matRoot.id },
      {
        bomSchemeId: bomScheme.id,
        materialId: matRoot.id,
        nodeType: 'LANDING_GEAR',
        quantity: 1,
        name: '主起落架总成',
      },
      'BOM 节点 根',
    );
    bomRootNodeId = rootNode.id;
    if (bomRootNodeId && matMajor.id) {
      await idempotentCreate(
        R.bomSchemeNode,
        { bomSchemeId: bomScheme.id, materialId: matMajor.id },
        {
          bomSchemeId: bomScheme.id,
          materialId: matMajor.id,
          nodeType: 'MAJOR_ASSEMBLY',
          quantity: 1,
          parentId: bomRootNodeId,
          name: '主支柱筒体总成',
        },
        'BOM 节点 主支柱',
      );
    }
    if (bomRootNodeId && matPrimary.id) {
      await idempotentCreate(
        R.bomSchemeNode,
        { bomSchemeId: bomScheme.id, materialId: matPrimary.id },
        {
          bomSchemeId: bomScheme.id,
          materialId: matPrimary.id,
          nodeType: 'PRIMARY_PART',
          quantity: 4,
          parentId: bomRootNodeId,
          name: '连接销轴',
        },
        'BOM 节点 销轴',
      );
    }
  }

  // ─────────────────────────────────────────
  // 5. BOP 方案 + 工序节点 + DAG 边
  // ─────────────────────────────────────────
  const bopScheme = await idempotentCreate<BopScheme>(
    R.bopScheme,
    { productModel: 'A320', repairMethod: 'OVERHAUL', versionStatus: 'PUBLISHED' },
    {
      productModel: 'A320',
      repairMethod: 'OVERHAUL',
      version: 1,
      versionStatus: 'PUBLISHED',
      name: 'A320 主起落架大修 BOP',
      bomSchemeId: bomScheme.id ?? null,
    },
    'BOP 方案 A320 大修',
  );

  const bopCheck = await idempotentCreate<BopScheme>(
    R.bopScheme,
    { productModel: 'A320', repairMethod: 'CHECK', versionStatus: 'PUBLISHED' },
    {
      productModel: 'A320',
      repairMethod: 'CHECK',
      version: 1,
      versionStatus: 'PUBLISHED',
      name: 'A320 前起落架检修 BOP',
      bomSchemeId: bomScheme.id ?? null,
    },
    'BOP 方案 A320 检修',
  );

  const routineLeaves = LEAF_SPECS.filter((l) => l.isRoutine);
  const bopNodes: { id?: string; nodeNo: string; operationNo: string }[] = [];
  if (bopScheme.id) {
    let sort = 1;
    for (const leaf of routineLeaves) {
      const op = opsByNo.get(leaf.operationNo);
      if (!op?.id) continue;
      const nodeNo = `N-${String(sort).padStart(2, '0')}`;
      const node = await idempotentCreate(
        R.bopOperationNode,
        { bopSchemeId: bopScheme.id, nodeNo },
        {
          bopSchemeId: bopScheme.id,
          nodeNo,
          operationId: op.id,
          sortOrder: sort,
          name: leaf.name,
        },
        `BOP 节点 ${nodeNo} (${leaf.operationNo})`,
      );
      bopNodes.push({ id: node.id, nodeNo, operationNo: leaf.operationNo });
      sort += 1;
    }
    for (let i = 0; i < bopNodes.length - 1; i++) {
      const from = bopNodes[i];
      const to = bopNodes[i + 1];
      if (!from.id || !to.id) continue;
      await idempotentCreate(
        R.bopOperationEdge,
        { bopSchemeId: bopScheme.id, fromNodeId: from.id, toNodeId: to.id },
        {
          bopSchemeId: bopScheme.id,
          fromNodeId: from.id,
          toNodeId: to.id,
          edgeType: 'NORMAL',
        },
        `BOP 边 ${from.nodeNo}→${to.nodeNo}`,
      );
    }
  }

  // 检修 BOP：少量节点
  if (bopCheck.id) {
    const checkOps = ['OP-REC-001', 'OP-INSPECT-01', 'OP-TST-003'];
    let sort = 1;
    const checkNodes: { id?: string }[] = [];
    for (const opNo of checkOps) {
      const op = opsByNo.get(opNo);
      if (!op?.id) continue;
      const nodeNo = `C-${String(sort).padStart(2, '0')}`;
      const node = await idempotentCreate(
        R.bopOperationNode,
        { bopSchemeId: bopCheck.id, nodeNo },
        {
          bopSchemeId: bopCheck.id,
          nodeNo,
          operationId: op.id,
          sortOrder: sort,
          name: op.name,
        },
        `检修 BOP 节点 ${nodeNo}`,
      );
      checkNodes.push(node);
      sort += 1;
    }
    for (let i = 0; i < checkNodes.length - 1; i++) {
      const from = checkNodes[i];
      const to = checkNodes[i + 1];
      if (!from.id || !to.id) continue;
      await idempotentCreate(
        R.bopOperationEdge,
        { bopSchemeId: bopCheck.id, fromNodeId: from.id, toNodeId: to.id },
        {
          bopSchemeId: bopCheck.id,
          fromNodeId: from.id,
          toNodeId: to.id,
          edgeType: 'NORMAL',
        },
        `检修 BOP 边 ${i + 1}`,
      );
    }
  }

  // ─────────────────────────────────────────
  // 6. 工位（不新增）
  //    - seed 历史工位 WS-DIS-01 / WS-INS-01：仅幂等保底
  //    - 故检修理线使用已有 F01~F05，按 stationNo 查询绑定
  // ─────────────────────────────────────────
  const wsDis = await idempotentCreate<Workstation>(
    R.workstation,
    { stationNo: 'WS-DIS-01' },
    {
      stationNo: 'WS-DIS-01',
      name: '分解工位 01',
      areaType: 'DISASSEMBLY',
      dailyLoadHours: '8',
      pipelineCapacityFactor: '2',
      enabled: true,
    },
    '工位 WS-DIS-01',
  );
  // 历史 seed 工位，保留但不作为故检修理线主绑定
  await idempotentCreate<Workstation>(
    R.workstation,
    { stationNo: 'WS-INS-01' },
    {
      stationNo: 'WS-INS-01',
      name: '故检工位 01',
      areaType: 'FAULT_REPAIR',
      dailyLoadHours: '8',
      pipelineCapacityFactor: '2',
      enabled: true,
    },
    '工位 WS-INS-01',
  );

  async function findWorkstationByNo(stationNo: string): Promise<Workstation | null> {
    const res = await eadafClient.findFiltered<Workstation>(R.workstation, { stationNo }, { limit: 1 });
    return res.items[0] ?? null;
  }

  const wsF01 = await findWorkstationByNo('F01'); // 分拣站
  const wsF02 = await findWorkstationByNo('F02'); // 故检站一
  const wsF03 = await findWorkstationByNo('F03'); // 故检站二
  const wsF04 = await findWorkstationByNo('F04'); // 修理站
  const wsF05 = await findWorkstationByNo('F05'); // 收发站
  if (!wsF01?.id || !wsF02?.id || !wsF03?.id || !wsF04?.id || !wsF05?.id) {
    throw new Error(
      `故检修理线已有工位不足，需要 F01~F05。当前: F01=${wsF01?.id} F02=${wsF02?.id} F03=${wsF03?.id} F04=${wsF04?.id} F05=${wsF05?.id}`,
    );
  }
  log(`绑定故检修理线已有工位: F01=${wsF01.name} F02=${wsF02.name} F03=${wsF03.name} F04=${wsF04.name} F05=${wsF05.name}`);

  const stationByKey: Record<StationKey, Workstation> = {
    DIS: wsDis,
    SORT: wsF01,
    INS: wsF02,
    INS2: wsF03,
    REP: wsF04,
    IO: wsF05,
    SPARE: wsF05, // 现场无独立备件库工位编码时挂收发站
  };
  const stationId = (key: StationKey) => stationByKey[key]?.id;

  // 工序默认工位回填（仅写 defaultWorkstationId，不改工位本身）
  for (const def of OP_DEFS) {
    const op = opsByNo.get(def.operationNo);
    const wsId = stationId(def.station);
    if (op?.id && wsId && !op.defaultWorkstationId) {
      try {
        await eadafClient.update(R.processOperation, op.id, { defaultWorkstationId: wsId });
        op.defaultWorkstationId = wsId;
      } catch {
        /* ignore */
      }
    }
  }

  // 维修资源（挂工序维度，不改工位）
  if (wsF02.id) {
    await idempotentCreate(
      R.repairResource,
      { resourceNo: 'RES-NDT-PT' },
      {
        resourceNo: 'RES-NDT-PT',
        name: '荧光渗透检测台',
        resourceType: 'EQUIPMENT',
        defaultWorkstationId: wsF02.id,
      },
      '资源 荧光渗透台',
    );
  }
  if (wsDis.id) {
    await idempotentCreate(
      R.repairResource,
      { resourceNo: 'RES-TOOL-DIS' },
      {
        resourceNo: 'RES-TOOL-DIS',
        name: '分解专用工装套件',
        resourceType: 'TOOLING',
        defaultWorkstationId: wsDis.id,
      },
      '资源 分解工装',
    );
  }

  // ─────────────────────────────────────────
  // 7. 排产配置 / 工位产能 / 产能配置
  // ─────────────────────────────────────────
  await idempotentCreate(
    R.scheduleConfig,
    { configKey: 'DEFAULT' },
    {
      configKey: 'DEFAULT',
      name: '默认排产配置',
      includeSaturday: false,
      includeSunday: false,
      amStart: '08:00',
      amEnd: '12:00',
      pmStart: '13:00',
      pmEnd: '17:00',
      pipelineCapacityFactor: '2',
      effectiveLookaheadSlots: 4,
      preferHistoricalMedian: true,
    },
    '排产配置 DEFAULT',
  );

  if (wsDis.id) {
    await idempotentCreate(
      R.workstationCapacity,
      { workstationId: wsDis.id, effectiveFrom: planStart },
      {
        workstationId: wsDis.id,
        effectiveFrom: planStart,
        dailyLoadHours: '8',
        amHours: '4',
        pmHours: '4',
        pipelineCapacityFactor: '2',
        name: '分解工位产能',
      },
      '工位产能 WS-DIS-01',
    );
    await idempotentCreate(
      R.capacityConfig,
      { config_code: 'CAP-WS-DIS-01' },
      {
        config_code: 'CAP-WS-DIS-01',
        workstation_id: wsDis.id,
        standard_half_day_hours: '4',
        standard_staff_count: 2,
        work_hour_conversion_factor: '1',
        auto_fill_threshold: '0.5',
        is_active: true,
        remark: '分解工位产能配置',
      },
      '产能配置 CAP-WS-DIS-01',
    );
  }
  // 故检修理线已有工位 F01~F05 产能（不新建工位）
  for (const ws of [wsF01, wsF02, wsF03, wsF04, wsF05]) {
    if (!ws.id) continue;
    await idempotentCreate(
      R.workstationCapacity,
      { workstationId: ws.id, effectiveFrom: planStart },
      {
        workstationId: ws.id,
        effectiveFrom: planStart,
        dailyLoadHours: '8',
        amHours: '4',
        pmHours: '4',
        pipelineCapacityFactor: '2',
        name: `${ws.name ?? ws.stationNo} 产能`,
      },
      `工位产能 ${ws.stationNo}`,
    );
    await idempotentCreate(
      R.capacityConfig,
      { config_code: `CAP-${ws.stationNo}` },
      {
        config_code: `CAP-${ws.stationNo}`,
        workstation_id: ws.id,
        standard_half_day_hours: '4',
        standard_staff_count: 2,
        work_hour_conversion_factor: '1',
        auto_fill_threshold: '0.5',
        is_active: true,
        remark: `${ws.name ?? ws.stationNo} 产能配置`,
      },
      `产能配置 CAP-${ws.stationNo}`,
    );
  }

  // 工时中位数（预排用）
  for (const def of OP_DEFS.slice(0, 12)) {
    const op = opsByNo.get(def.operationNo);
    if (!op?.id) continue;
    await idempotentCreate(
      R.workHourMedian,
      { productModel: 'A320', repairMethod: 'OVERHAUL', processOperationId: op.id },
      {
        productModel: 'A320',
        repairMethod: 'OVERHAUL',
        processOperationId: op.id,
        medianHours: String(Math.max(1, def.standardHours - 0.5)),
        sampleCount: 28 + (def.standardHours % 7),
        lastCalculatedAt: new Date().toISOString(),
        name: `${def.operationNo} 中位数`,
      },
      `工时中位数 ${def.operationNo}`,
    );
  }

  // ─────────────────────────────────────────
  // 8. 厂级指令
  // ─────────────────────────────────────────
  const factoryOrder = await idempotentCreate<FactoryOrder>(
    R.factoryOrder,
    { factoryOrderNo: 'FO-2026-0701' },
    {
      factoryOrderNo: 'FO-2026-0701',
      name: '2026 年 7 月 A320 起落架大修批次',
      aircraftRef: 'A320-B-6055',
    },
    '厂级指令 FO-2026-0701',
  );
  // 兼容旧 seed 编号
  await idempotentCreate<FactoryOrder>(
    R.factoryOrder,
    { factoryOrderNo: 'FO-2024-0001' },
    {
      factoryOrderNo: 'FO-2024-0001',
      name: '2024 年第一批 A320 大修',
      aircraftRef: 'A320-B001',
    },
    '厂级指令 FO-2024-0001',
  );

  const factoryOrder2 = await idempotentCreate<FactoryOrder>(
    R.factoryOrder,
    { factoryOrderNo: 'FO-2026-0702' },
    {
      factoryOrderNo: 'FO-2026-0702',
      name: '2026 年 7 月前起落架检修',
      aircraftRef: 'A320-B-6088',
    },
    '厂级指令 FO-2026-0702',
  );

  // ─────────────────────────────────────────
  // 9. 主令号投产实例：LG-LH-202607001（对齐 WBS 示例）
  // ─────────────────────────────────────────
  const orderNo = 'LG-LH-202607001';
  const workshopOrder = await idempotentCreate<WorkshopOrder>(
    R.workshopOrder,
    { workshopOrderNo: orderNo },
    {
      workshopOrderNo: orderNo,
      name: '主起落架总成大修',
      factoryOrderId: factoryOrder.id!,
      productId: product.id!,
      repairMethod: 'OVERHAUL',
      bopSchemeId: bopScheme.id ?? null,
      planStartDate: planStart,
      planEndDate: planEnd,
      status: 'IN_PROGRESS',
    },
    `车间令号 ${orderNo}`,
  );

  const bopInstance = await idempotentCreate<BopInstance>(
    R.bopInstance,
    { workshopOrderId: workshopOrder.id! },
    {
      workshopOrderId: workshopOrder.id!,
      bopSchemeId: bopScheme.id!,
      frozenSchemeVersion: 1,
      name: 'BOP-LG-DAXIU-008',
    },
    'BOP 实例 大修',
  );

  const singlePlan = await idempotentCreate<SingleUnitPlan>(
    R.singleUnitPlan,
    { workshopOrderId: workshopOrder.id! },
    {
      workshopOrderId: workshopOrder.id!,
      name: 'LG-OVHL-001 单台计划',
    },
    '单台计划',
  );

  // 工卡 + 工序实例 + 任务 + 计划时段
  const cardsByCode = new Map<string, WorkCard>();
  const opInstByCode = new Map<string, string>();
  let seq = 1;

  for (const leaf of LEAF_SPECS) {
    const op = opsByNo.get(leaf.operationNo);
    if (!op?.id || !bopInstance.id || !workshopOrder.id) continue;
    const opDef = OP_DEFS.find((d) => d.operationNo === leaf.operationNo)!;
    const wsId = stationId(opDef.station);
    const plannedDate = workdayOffset(planStart, leaf.dayOffset);

    const opInst = await idempotentCreate(
      R.operationInstance,
      { bopInstanceId: bopInstance.id, sourceNodeNo: leaf.code },
      {
        bopInstanceId: bopInstance.id,
        processOperationId: op.id,
        sourceNodeNo: leaf.code,
        isRoutine: leaf.isRoutine,
        name: leaf.name,
      },
      `工序实例 ${leaf.code}`,
    );
    if (opInst.id) opInstByCode.set(leaf.code, opInst.id);

    const workCardNo = `WC-2607001-${String(seq).padStart(3, '0')}`;
    const cardBody: Record<string, unknown> = {
      workCardNo,
      name: leaf.name,
      workshopOrderId: workshopOrder.id,
      operationInstanceId: opInst.id,
      bopInstanceId: bopInstance.id,
      status: leaf.status,
      isRoutine: leaf.isRoutine,
      kitRequired: leaf.kitRequired,
      priority: leaf.priority,
      workstationId: wsId ?? null,
      plannedDate,
      plannedHalfDay: leaf.half,
      standardHours: String(opDef.standardHours),
      selectedHours: String(opDef.standardHours),
      pipelineOrder: leaf.pipelineOrder ?? null,
      occupiesPipeline: leaf.occupiesPipeline ?? false,
    };
    if (leaf.status === 'REPAIR_DONE') {
      cardBody.acceptedAt = `${plannedDate}T08:10:00.000Z`;
      cardBody.repairStartedAt = `${plannedDate}T08:30:00.000Z`;
      cardBody.repairFinishedAt = `${plannedDate}T${leaf.half === 'AM' ? '11' : '16'}:30:00.000Z`;
      cardBody.actualHours = String(opDef.standardHours);
    } else if (leaf.status === 'REPAIRING') {
      cardBody.acceptedAt = `${plannedDate}T08:10:00.000Z`;
      cardBody.repairStartedAt = `${plannedDate}T08:30:00.000Z`;
    } else if (leaf.status === 'PENDING_REPAIR') {
      cardBody.acceptedAt = `${plannedDate}T08:10:00.000Z`;
    } else if (leaf.status === 'PENDING_ACCEPT') {
      cardBody.occupiesPipeline = true;
    }

    const card = await idempotentCreate<WorkCard>(
      R.workCard,
      { workCardNo },
      cardBody,
      `工卡 ${workCardNo}`,
    );
    cardsByCode.set(leaf.code, card);

    if (card.id && singlePlan.id) {
      await idempotentCreate(
        R.workCardTask,
        { workCardId: card.id, singleUnitPlanId: singlePlan.id },
        {
          workCardId: card.id,
          singleUnitPlanId: singlePlan.id,
          plannedDate,
          plannedHalfDay: leaf.half,
          wbsOrder: seq,
          name: leaf.name,
        },
        `工卡任务 ${workCardNo}`,
      );

      // 计划时段（负荷图/利用率）
      if (wsId && leaf.status !== 'CANCELLED') {
        const hours = Math.min(4, opDef.standardHours);
        await idempotentCreate(
          R.workCardPlanSlot,
          { workCardId: card.id, slotDate: plannedDate, halfDay: leaf.half },
          {
            workCardId: card.id,
            workstationId: wsId,
            slotDate: plannedDate,
            halfDay: leaf.half,
            hours: String(hours),
            seq: 1,
            name: `${workCardNo} ${plannedDate} ${leaf.half}`,
          },
          `计划时段 ${workCardNo}`,
        );
      }
    }
    seq += 1;
  }

  // 工卡 DAG 边（例行串行；非例行挂在探伤后）
  const sequentialCodes = LEAF_SPECS.filter((l) => l.isRoutine).map((l) => l.code);
  for (let i = 0; i < sequentialCodes.length - 1; i++) {
    const from = cardsByCode.get(sequentialCodes[i]);
    const to = cardsByCode.get(sequentialCodes[i + 1]);
    if (!from?.id || !to?.id) continue;
    await idempotentCreate(
      R.workCardEdge,
      { fromWorkCardId: from.id, toWorkCardId: to.id },
      {
        fromWorkCardId: from.id,
        toWorkCardId: to.id,
        edgeType: 'NORMAL',
        isMandatory: true,
      },
      `工卡边 ${sequentialCodes[i]}→${sequentialCodes[i + 1]}`,
    );
  }
  const ndtCard = cardsByCode.get('1.04.02.01');
  const nrCard = cardsByCode.get('1.09.01.01');
  if (ndtCard?.id && nrCard?.id) {
    await idempotentCreate(
      R.workCardEdge,
      { fromWorkCardId: ndtCard.id, toWorkCardId: nrCard.id },
      {
        fromWorkCardId: ndtCard.id,
        toWorkCardId: nrCard.id,
        edgeType: 'FAIL',
        isMandatory: false,
      },
      '工卡边 探伤→裂纹返修',
    );
  }

  // 齐套需求 + 委外
  const kitCard = cardsByCode.get('1.05.03.01');
  if (kitCard?.id) {
    await idempotentCreate(
      R.workCardKitRequirement,
      { workCardId: kitCard.id, dimension: 'MATERIAL' },
      {
        workCardId: kitCard.id,
        dimension: 'MATERIAL',
        materialId: matSeal.id ?? null,
        satisfied: false,
        name: '缓冲密封圈组',
      },
      '齐套需求 密封圈',
    );
    await idempotentCreate(
      R.workCardKitRequirement,
      { workCardId: kitCard.id, dimension: 'PERSON' },
      {
        workCardId: kitCard.id,
        dimension: 'PERSON',
        satisfied: true,
        name: '装配操作员',
      },
      '齐套需求 人员',
    );
  }
  const outCard = cardsByCode.get('1.05.02.01');
  if (outCard?.id) {
    const outsourcing = await idempotentCreate(
      R.workCardOutsourcing,
      { workCardId: outCard.id },
      {
        workCardId: outCard.id,
        materialId: matPlate.id ?? null,
        status: 'IN_PROGRESS',
        issuedAt: '2026-07-16T02:00:00.000Z',
        name: '支柱筒体电镀委外',
      },
      '委外 电镀',
    );
    await idempotentCreate(
      R.workCardKitRequirement,
      { workCardId: outCard.id, dimension: 'MATERIAL' },
      {
        workCardId: outCard.id,
        dimension: 'MATERIAL',
        materialId: matPlate.id ?? null,
        outsourcingId: outsourcing.id ?? null,
        satisfied: false,
        name: '电镀件返回齐套',
      },
      '齐套需求 电镀委外件',
    );
  }
  const asmCard = cardsByCode.get('1.06.01.01');
  if (asmCard?.id && outCard?.id) {
    await idempotentCreate(
      R.workCardKitRequirement,
      { workCardId: asmCard.id, dimension: 'MATERIAL' },
      {
        workCardId: asmCard.id,
        dimension: 'MATERIAL',
        materialId: matPlate.id ?? null,
        satisfied: false,
        name: '依赖电镀件返回',
        remark: `dependsOn=${outCard.workCardNo}`,
      },
      '齐套需求 装配依赖电镀',
    );
  }

  // ─────────────────────────────────────────
  // 9b. 故检修理线：回写工位 + 补齐各工位多状态工卡
  // ─────────────────────────────────────────
  // 回写主令号中故检修理线相关工卡的目标工位（幂等：已正确则跳过）
  for (const leaf of LEAF_SPECS) {
    const opDef = OP_DEFS.find((d) => d.operationNo === leaf.operationNo);
    if (!opDef || opDef.station === 'DIS') continue;
    const card = cardsByCode.get(leaf.code);
    const targetWsId = stationId(opDef.station);
    if (!card?.id || !targetWsId) continue;
    if (card.workstationId === targetWsId) continue;
    try {
      await eadafClient.update(R.workCard, card.id, { workstationId: targetWsId });
      card.workstationId = targetWsId;
      log(`回写工位: ${card.workCardNo} → ${opDef.station}`);
      // 同步计划时段工位
      const slots = await eadafClient.findFiltered<{ id?: string }>(
        R.workCardPlanSlot,
        { workCardId: card.id },
        { limit: 20 },
      );
      for (const slot of slots.items) {
        if (slot.id) {
          await eadafClient.update(R.workCardPlanSlot, slot.id, { workstationId: targetWsId });
        }
      }
    } catch (e) {
      log(`警告（跳过）: 回写工位 ${card.workCardNo} — ${(e as Error).message}`);
    }
  }

  /** 故检修理线各工位补卡：覆盖管道/看板常见状态 */
  type FrDemoCard = {
    workCardNo: string;
    name: string;
    operationNo: string;
    station: StationKey;
    status: string;
    dayOffset: number;
    half: 'AM' | 'PM';
    isRoutine: boolean;
    kitRequired: boolean;
    priority: 'ROUTINE' | 'NON_ROUTINE' | 'URGENT';
    pipelineOrder?: number;
    occupiesPipeline?: boolean;
  };
  const frDemoCards: FrDemoCard[] = [
    // F01 分拣站
    { workCardNo: 'WC-FR-SORT-001', name: '分拣站·尺寸复测（待接受）', operationNo: 'OP-MET-001', station: 'SORT', status: 'PENDING_ACCEPT', dayOffset: 6, half: 'AM', isRoutine: true, kitRequired: false, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
    { workCardNo: 'WC-FR-SORT-002', name: '分拣站·分类标识（待生效）', operationNo: 'OP-MET-001', station: 'SORT', status: 'PENDING_EFFECTIVE', dayOffset: 7, half: 'PM', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
    { workCardNo: 'WC-FR-SORT-003', name: '分拣站·批次归集（修理结束）', operationNo: 'OP-MET-001', station: 'SORT', status: 'REPAIR_DONE', dayOffset: 4, half: 'AM', isRoutine: true, kitRequired: false, priority: 'ROUTINE' },
    // F02 故检站一
    { workCardNo: 'WC-FR-INS1-001', name: '故检站一·目视复检（待修理）', operationNo: 'OP-INSPECT-01', station: 'INS', status: 'PENDING_REPAIR', dayOffset: 5, half: 'AM', isRoutine: true, kitRequired: false, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
    { workCardNo: 'WC-FR-INS1-002', name: '故检站一·缺陷复核（负荷挂起）', operationNo: 'OP-INSPECT-01', station: 'INS', status: 'LOAD_SUSPENDED', dayOffset: 5, half: 'PM', isRoutine: true, kitRequired: false, priority: 'ROUTINE', occupiesPipeline: false },
    { workCardNo: 'WC-FR-INS1-003', name: '故检站一·符合性抽查（待接受）', operationNo: 'OP-TST-003', station: 'INS', status: 'PENDING_ACCEPT', dayOffset: 6, half: 'AM', isRoutine: true, kitRequired: false, priority: 'ROUTINE', pipelineOrder: 2, occupiesPipeline: true },
    // F03 故检站二
    { workCardNo: 'WC-FR-INS2-001', name: '故检站二·PT 复探（修理中）', operationNo: 'OP-NDT-001', station: 'INS2', status: 'REPAIRING', dayOffset: 5, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
    { workCardNo: 'WC-FR-INS2-002', name: '故检站二·ET 抽检（待接受）', operationNo: 'OP-NDT-002', station: 'INS2', status: 'PENDING_ACCEPT', dayOffset: 5, half: 'PM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 2, occupiesPipeline: true },
    { workCardNo: 'WC-FR-INS2-003', name: '故检站二·探伤齐套挂起', operationNo: 'OP-NDT-001', station: 'INS2', status: 'KIT_SUSPENDED', dayOffset: 6, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', occupiesPipeline: false },
    // F04 修理站
    { workCardNo: 'WC-FR-REP-001', name: '修理站·机加修复（修理中）', operationNo: 'OP-REP-001', station: 'REP', status: 'REPAIRING', dayOffset: 7, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
    { workCardNo: 'WC-FR-REP-002', name: '修理站·裂纹返修 Insert（待接受）', operationNo: 'OP-NR-001', station: 'REP', status: 'PENDING_ACCEPT', dayOffset: 5, half: 'AM', isRoutine: false, kitRequired: true, priority: 'URGENT', pipelineOrder: 0, occupiesPipeline: true },
    { workCardNo: 'WC-FR-REP-003', name: '修理站·缓冲预装（待生效）', operationNo: 'OP-ASM-001', station: 'REP', status: 'PENDING_EFFECTIVE', dayOffset: 10, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
    { workCardNo: 'WC-FR-REP-004', name: '修理站·渗漏返工（待修理）', operationNo: 'OP-NR-002', station: 'REP', status: 'PENDING_REPAIR', dayOffset: 8, half: 'PM', isRoutine: false, kitRequired: true, priority: 'NON_ROUTINE', pipelineOrder: 2, occupiesPipeline: true },
    // F05 收发站
    { workCardNo: 'WC-FR-IO-001', name: '收发站·电镀发出（齐套挂起）', operationNo: 'OP-OUT-001', station: 'IO', status: 'KIT_SUSPENDED', dayOffset: 8, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', occupiesPipeline: false },
    { workCardNo: 'WC-FR-IO-002', name: '收发站·协作件接收（待接受）', operationNo: 'OP-OUT-001', station: 'IO', status: 'PENDING_ACCEPT', dayOffset: 9, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
    { workCardNo: 'WC-FR-IO-003', name: '收发站·委外登记（待生效）', operationNo: 'OP-OUT-001', station: 'IO', status: 'PENDING_EFFECTIVE', dayOffset: 10, half: 'PM', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
    // 备件配套挂收发站 F05（现场无独立备件库编码）
    { workCardNo: 'WC-FR-SPARE-001', name: '收发站·密封圈配套（待接受）', operationNo: 'OP-KIT-001', station: 'SPARE', status: 'PENDING_ACCEPT', dayOffset: 9, half: 'AM', isRoutine: true, kitRequired: true, priority: 'ROUTINE', pipelineOrder: 1, occupiesPipeline: true },
    { workCardNo: 'WC-FR-SPARE-002', name: '收发站·衬套齐套校验（待生效）', operationNo: 'OP-KIT-001', station: 'SPARE', status: 'PENDING_EFFECTIVE', dayOffset: 9, half: 'PM', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
    { workCardNo: 'WC-FR-SPARE-003', name: '收发站·易损件出库（修理结束）', operationNo: 'OP-KIT-001', station: 'SPARE', status: 'REPAIR_DONE', dayOffset: 3, half: 'PM', isRoutine: true, kitRequired: true, priority: 'ROUTINE' },
  ];

  let frSeq = 100;
  for (const demo of frDemoCards) {
    const op = opsByNo.get(demo.operationNo);
    const wsId = stationId(demo.station);
    if (!op?.id || !wsId || !bopInstance.id || !workshopOrder.id) continue;
    const plannedDate = workdayOffset(planStart, demo.dayOffset);
    const sourceNodeNo = `FR-${demo.workCardNo}`;

    const opInst = await idempotentCreate(
      R.operationInstance,
      { bopInstanceId: bopInstance.id, sourceNodeNo },
      {
        bopInstanceId: bopInstance.id,
        processOperationId: op.id,
        sourceNodeNo,
        isRoutine: demo.isRoutine,
        name: demo.name,
      },
      `故检线工序实例 ${demo.workCardNo}`,
    );

    const cardBody: Record<string, unknown> = {
      workCardNo: demo.workCardNo,
      name: demo.name,
      workshopOrderId: workshopOrder.id,
      operationInstanceId: opInst.id,
      bopInstanceId: bopInstance.id,
      status: demo.status,
      isRoutine: demo.isRoutine,
      kitRequired: demo.kitRequired,
      priority: demo.priority,
      workstationId: wsId,
      plannedDate,
      plannedHalfDay: demo.half,
      standardHours: String(op.standardHours ?? 4),
      selectedHours: String(op.standardHours ?? 4),
      pipelineOrder: demo.pipelineOrder != null ? demo.pipelineOrder : 99,
      occupiesPipeline: demo.occupiesPipeline === true,
      remark: `FAULT_REPAIR demo @ ${demo.station}`,
    };
    if (demo.status === 'REPAIR_DONE') {
      cardBody.acceptedAt = `${plannedDate}T08:10:00.000Z`;
      cardBody.repairStartedAt = `${plannedDate}T08:30:00.000Z`;
      cardBody.repairFinishedAt = `${plannedDate}T11:30:00.000Z`;
      cardBody.actualHours = String(op.standardHours ?? 4);
    } else if (demo.status === 'REPAIRING') {
      cardBody.acceptedAt = `${plannedDate}T08:10:00.000Z`;
      cardBody.repairStartedAt = `${plannedDate}T08:30:00.000Z`;
    } else if (demo.status === 'PENDING_REPAIR') {
      cardBody.acceptedAt = `${plannedDate}T08:10:00.000Z`;
    }

    const card = await idempotentCreate<WorkCard>(
      R.workCard,
      { workCardNo: demo.workCardNo },
      cardBody,
      `故检线工卡 ${demo.workCardNo}`,
    );

    if (card.id && singlePlan.id) {
      await idempotentCreate(
        R.workCardTask,
        { workCardId: card.id, singleUnitPlanId: singlePlan.id },
        {
          workCardId: card.id,
          singleUnitPlanId: singlePlan.id,
          plannedDate,
          plannedHalfDay: demo.half,
          wbsOrder: frSeq,
          name: demo.name,
        },
        `故检线任务 ${demo.workCardNo}`,
      );
      await idempotentCreate(
        R.workCardPlanSlot,
        { workCardId: card.id, slotDate: plannedDate, halfDay: demo.half },
        {
          workCardId: card.id,
          workstationId: wsId,
          slotDate: plannedDate,
          halfDay: demo.half,
          hours: '4',
          seq: 1,
          name: `${demo.workCardNo} ${plannedDate} ${demo.half}`,
        },
        `故检线时段 ${demo.workCardNo}`,
      );
    }

    // 齐套挂起卡补一条缺项，便于齐套页联调
    if (card.id && demo.status === 'KIT_SUSPENDED') {
      await idempotentCreate(
        R.workCardKitRequirement,
        { workCardId: card.id, dimension: 'MATERIAL' },
        {
          workCardId: card.id,
          dimension: 'MATERIAL',
          materialId: matSeal.id ?? null,
          satisfied: false,
          name: `${demo.name} 缺料`,
        },
        `故检线齐套 ${demo.workCardNo}`,
      );
    }
    frSeq += 1;
  }

  // ─────────────────────────────────────────
  // 10. WBS 树（对齐文档 LG-OVHL-001）
  // ─────────────────────────────────────────
  if (workshopOrder.id && singlePlan.id) {
    const root = await idempotentCreate<WbsNode>(
      R.wbsNode,
      { code: 'LG-OVHL-001' },
      {
        code: 'LG-OVHL-001',
        name: '主起落架总成大修（车间令号：LG-LH-202607001）',
        level: 1,
        nodeType: 'ROOT',
        workshopOrderId: workshopOrder.id,
        singleUnitPlanId: singlePlan.id,
        isRoutine: true,
        isMaterialBundle: false,
        status: 'REPAIRING',
        sortOrder: 1,
      },
      'WBS 根 LG-OVHL-001',
    );

    let phaseSort = 1;
    for (const phase of WBS_PHASES) {
      const phaseNode = await idempotentCreate<WbsNode>(
        R.wbsNode,
        { code: phase.code, workshopOrderId: workshopOrder.id },
        {
          code: phase.code,
          name: phase.name,
          level: 2,
          nodeType: 'PHASE',
          parentId: root.id ?? null,
          workshopOrderId: workshopOrder.id,
          singleUnitPlanId: singlePlan.id,
          isRoutine: !phase.code.startsWith('1.09'),
          isMaterialBundle: false,
          status: 'PENDING_EFFECTIVE',
          sortOrder: phaseSort,
        },
        `WBS 阶段 ${phase.code}`,
      );
      phaseSort += 1;

      let pkgSort = 1;
      for (const pkg of phase.packages) {
        const pkgNode = await idempotentCreate<WbsNode>(
          R.wbsNode,
          { code: pkg.code, workshopOrderId: workshopOrder.id },
          {
            code: pkg.code,
            name: pkg.name,
            level: 3,
            nodeType: 'PACKAGE',
            parentId: phaseNode.id ?? null,
            workshopOrderId: workshopOrder.id,
            singleUnitPlanId: singlePlan.id,
            isRoutine: !pkg.code.startsWith('1.09'),
            isMaterialBundle: false,
            status: 'PENDING_EFFECTIVE',
            sortOrder: pkgSort,
          },
          `WBS 作业包 ${pkg.code}`,
        );
        pkgSort += 1;

        let leafSort = 1;
        for (const leafCode of pkg.leaves) {
          const leaf = LEAF_SPECS.find((l) => l.code === leafCode);
          const card = cardsByCode.get(leafCode);
          const opInstId = opInstByCode.get(leafCode);
          const opDef = leaf ? OP_DEFS.find((d) => d.operationNo === leaf.operationNo) : undefined;
          await idempotentCreate<WbsNode>(
            R.wbsNode,
            { code: leafCode, workshopOrderId: workshopOrder.id },
            {
              code: leafCode,
              name: leaf?.name ?? leafCode,
              level: 5,
              nodeType: 'TASK',
              parentId: pkgNode.id ?? null,
              workshopOrderId: workshopOrder.id,
              singleUnitPlanId: singlePlan.id,
              workstationId: opDef ? stationId(opDef.station) ?? null : null,
              operationInstanceId: opInstId ?? null,
              isRoutine: leaf?.isRoutine ?? true,
              isMaterialBundle: leaf?.kitRequired ?? false,
              status: leaf?.status ?? 'PENDING_EFFECTIVE',
              sortOrder: leafSort,
              remark: card?.workCardNo ? `workcard=${card.workCardNo}` : null,
            },
            `WBS 任务 ${leafCode}`,
          );
          leafSort += 1;
        }
      }
    }
  }

  // ─────────────────────────────────────────
  // 11. 第二令号（检修，便于多令号甘特对比）
  // ─────────────────────────────────────────
  const orderNo2 = 'LG-NLG-202607002';
  const workshopOrder2 = await idempotentCreate<WorkshopOrder>(
    R.workshopOrder,
    { workshopOrderNo: orderNo2 },
    {
      workshopOrderNo: orderNo2,
      name: '前起落架检修',
      factoryOrderId: factoryOrder2.id!,
      productId: productNose.id!,
      repairMethod: 'CHECK',
      bopSchemeId: bopCheck.id ?? null,
      planStartDate: '2026-07-20',
      planEndDate: '2026-07-31',
      status: 'RELEASED',
    },
    `车间令号 ${orderNo2}`,
  );

  if (workshopOrder2.id && bopCheck.id) {
    const bopInst2 = await idempotentCreate<BopInstance>(
      R.bopInstance,
      { workshopOrderId: workshopOrder2.id },
      {
        workshopOrderId: workshopOrder2.id,
        bopSchemeId: bopCheck.id,
        frozenSchemeVersion: 1,
        name: 'BOP-LG-CHECK-001',
      },
      'BOP 实例 检修',
    );
    const plan2 = await idempotentCreate<SingleUnitPlan>(
      R.singleUnitPlan,
      { workshopOrderId: workshopOrder2.id },
      { workshopOrderId: workshopOrder2.id, name: `${orderNo2} 单台计划` },
      '单台计划 检修',
    );
    await idempotentCreate<WbsNode>(
      R.wbsNode,
      { code: `WBS-${orderNo2}` },
      {
        code: `WBS-${orderNo2}`,
        name: `${orderNo2} 单台计划`,
        level: 0,
        nodeType: 'ROOT',
        workshopOrderId: workshopOrder2.id,
        singleUnitPlanId: plan2.id,
        isRoutine: true,
        isMaterialBundle: false,
        status: 'PENDING_EFFECTIVE',
      },
      `WBS 根 ${orderNo2}`,
    );

    const checkLeaves = [
      { op: 'OP-REC-001', status: 'PENDING_ACCEPT', day: 0, half: 'AM' as const },
      { op: 'OP-INSPECT-01', status: 'PENDING_EFFECTIVE', day: 1, half: 'AM' as const },
      { op: 'OP-TST-003', status: 'PENDING_EFFECTIVE', day: 3, half: 'PM' as const },
    ];
    let s = 1;
    for (const item of checkLeaves) {
      const op = opsByNo.get(item.op);
      if (!op?.id || !bopInst2.id) continue;
      const opDef = OP_DEFS.find((d) => d.operationNo === item.op)!;
      const plannedDate = workdayOffset('2026-07-20', item.day);
      const opInst = await idempotentCreate(
        R.operationInstance,
        { bopInstanceId: bopInst2.id, sourceNodeNo: `C-${s}` },
        {
          bopInstanceId: bopInst2.id,
          processOperationId: op.id,
          sourceNodeNo: `C-${s}`,
          isRoutine: true,
          name: op.name,
        },
        `检修工序实例 C-${s}`,
      );
      const workCardNo = `WC-2607002-${String(s).padStart(3, '0')}`;
      const card = await idempotentCreate<WorkCard>(
        R.workCard,
        { workCardNo },
        {
          workCardNo,
          name: op.name,
          workshopOrderId: workshopOrder2.id,
          operationInstanceId: opInst.id,
          bopInstanceId: bopInst2.id,
          status: item.status,
          isRoutine: true,
          kitRequired: false,
          priority: 'ROUTINE',
          workstationId: stationId(opDef.station) ?? null,
          plannedDate,
          plannedHalfDay: item.half,
          standardHours: String(opDef.standardHours),
          selectedHours: String(opDef.standardHours),
          occupiesPipeline: item.status === 'PENDING_ACCEPT',
          pipelineOrder: item.status === 'PENDING_ACCEPT' ? 1 : null,
        },
        `工卡 ${workCardNo}`,
      );
      if (card.id && plan2.id) {
        await idempotentCreate(
          R.workCardTask,
          { workCardId: card.id, singleUnitPlanId: plan2.id },
          {
            workCardId: card.id,
            singleUnitPlanId: plan2.id,
            plannedDate,
            plannedHalfDay: item.half,
            wbsOrder: s,
          },
          `检修任务 ${workCardNo}`,
        );
        const wsId = stationId(opDef.station);
        if (wsId) {
          await idempotentCreate(
            R.workCardPlanSlot,
            { workCardId: card.id, slotDate: plannedDate, halfDay: item.half },
            {
              workCardId: card.id,
              workstationId: wsId,
              slotDate: plannedDate,
              halfDay: item.half,
              hours: '4',
              seq: 1,
            },
            `检修时段 ${workCardNo}`,
          );
        }
      }
      s += 1;
    }
  }

  // ─────────────────────────────────────────
  // 12. 工艺模板 / 排产版本 / 预警 / 统计（辅助数据，单项失败不阻断）
  // ─────────────────────────────────────────
  const softCreate = async (
    routePath: string,
    filter: Record<string, unknown>,
    body: Record<string, unknown>,
    label: string,
  ) => {
    try {
      await idempotentCreate(routePath, filter, body, label);
    } catch (e) {
      log(`警告（跳过）: ${label} — ${(e as Error).message}`);
    }
  };

  await softCreate(
    R.processTemplate,
    { template_code: 'PT-A320-OVHL' },
    {
      template_code: 'PT-A320-OVHL',
      template_name: 'A320 主起落架大修工艺路线',
      aircraft_model: 'A320',
      gear_model: 'MLG',
      repair_type: 'OVERHAUL',
      version: 'v1',
      total_standard_hours: '120',
      description: '对齐大修标准 BOP',
      is_active: true,
    },
    '工艺模板 PT-A320-OVHL',
  );
  await softCreate(
    R.workCardTemplate,
    { card_template_code: 'WCT-NDT-PT' },
    {
      card_template_code: 'WCT-NDT-PT',
      card_template_name: '荧光渗透PT检测工卡模板',
      card_type: 'ROUTINE',
      standard_hours: '6',
      kit_check_dimensions: 'EQUIPMENT,PERSON',
      required_staff_count: 2,
      skill_requirement: 'NDT II 级',
      sort_order: 1,
      work_step_count: 3,
      is_active: true,
    },
    '工卡模板 WCT-NDT-PT',
  );
  // 已存在的模板补齐 is_active
  {
    const existing = await eadafClient.findFiltered<{ id?: string; is_active?: boolean }>(
      R.workCardTemplate,
      { card_template_code: 'WCT-NDT-PT' },
      { limit: 1 },
    );
    const tpl = existing.items[0];
    if (tpl?.id && tpl.is_active !== true) {
      try {
        await eadafClient.update(R.workCardTemplate, tpl.id, { is_active: true });
        log('更新: 工卡模板 WCT-NDT-PT.is_active=true');
      } catch (e) {
        log(`警告（跳过）: 工卡模板 is_active — ${(e as Error).message}`);
      }
    }
  }

  await softCreate(
    R.planVersion,
    { version_code: 'PV-2026-07-W3' },
    {
      version_code: 'PV-2026-07-W3',
      version_name: '2026年第29周排产版本',
      plan_type: 'PRE_SCHEDULE',
      status: 'PUBLISHED',
      planning_horizon_start: planStart,
      planning_horizon_end: planEnd,
      version_notes: '主令号大修 + 前起检修联合预排',
      created_by: 'seed',
    },
    '排产版本 PV-2026-07-W3',
  );
  if (wsF02.id) {
    await softCreate(
      R.schedulePlan,
      { plan_code: 'SP-INS-20260724-AM' },
      {
        plan_code: 'SP-INS-20260724-AM',
        plan_name: '故检站一 7/24 上午执行计划',
        plan_type: 'EXECUTION',
        status: 'EXECUTING',
        workstation_id: wsF02.id,
        time_slot: '2026-07-24 AM',
        total_hours_planned: '8',
        total_hours_actual: '3.5',
        load_rate: '0.85',
        is_conflict: false,
      },
      '排产计划 SP-INS-20260724-AM',
    );
  }

  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-KIT-PLATE-001' },
    {
      alert_code: 'ALT-KIT-PLATE-001',
      alert_content: '工卡 WC-2607001-015 / WC-FR-IO-001 电镀委外件未返回，齐套挂起已超 2 天',
      alert_type: 'KIT_SHORTAGE',
      alert_level: 'HIGH',
      alert_time: '2026-07-22T01:00:00.000Z',
      source_entity_code: 'WC-FR-IO-001',
      is_resolved: false,
    },
    '预警 齐套缺料',
  );
  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-LOAD-F03-001' },
    {
      alert_code: 'ALT-LOAD-F03-001',
      alert_content: '故检站二 F03 管道占用接近日负荷×2，存在负荷挂起风险',
      alert_type: 'OVERLOAD',
      alert_level: 'NORMAL',
      alert_time: '2026-07-23T06:30:00.000Z',
      source_entity_code: 'F03',
      is_resolved: false,
    },
    '预警 超负荷 F03',
  );
  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-DELAY-001' },
    {
      alert_code: 'ALT-DELAY-001',
      alert_content: `令号 ${orderNo} 计划完工 ${planEnd}，电镀委外延误可能导致交付风险`,
      alert_type: 'DELAY_RISK',
      alert_level: 'URGENT',
      alert_time: '2026-07-23T08:00:00.000Z',
      source_entity_code: orderNo,
      is_resolved: false,
    },
    '预警 延期风险',
  );
  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-KIT-F02-001' },
    {
      alert_code: 'ALT-KIT-F02-001',
      alert_content: '故检站一 F02 工卡 WC-FR-INS1-002 负荷挂起超过 1 个班次',
      alert_type: 'BOTTLENECK',
      alert_level: 'HIGH',
      alert_time: '2026-07-23T09:15:00.000Z',
      source_entity_code: 'F02',
      is_resolved: false,
    },
    '预警 瓶颈 F02',
  );
  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-RES-F04-001' },
    {
      alert_code: 'ALT-RES-F04-001',
      alert_content: '修理站 F04 紧急插单 WC-FR-REP-002 与例行机加修复资源冲突',
      alert_type: 'RESOURCE_CONFLICT',
      alert_level: 'HIGH',
      alert_time: '2026-07-23T10:00:00.000Z',
      source_entity_code: 'F04',
      is_resolved: false,
    },
    '预警 资源冲突 F04',
  );
  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-LOAD-F04-001' },
    {
      alert_code: 'ALT-LOAD-F04-001',
      alert_content: '修理站 F04 在制+待接受工卡工时已超日负荷×2 预警线',
      alert_type: 'OVERLOAD',
      alert_level: 'URGENT',
      alert_time: '2026-07-24T01:20:00.000Z',
      source_entity_code: 'F04',
      is_resolved: false,
    },
    '预警 超负荷 F04',
  );
  await softCreate(
    R.alertRecord,
    { alert_code: 'ALT-DELAY-NLG-001' },
    {
      alert_code: 'ALT-DELAY-NLG-001',
      alert_content: '令号 LG-NLG-202607002 前起检修计划窗口偏紧，存在里程碑延期风险',
      alert_type: 'DELAY_RISK',
      alert_level: 'NORMAL',
      alert_time: '2026-07-24T02:00:00.000Z',
      source_entity_code: 'LG-NLG-202607002',
      is_resolved: false,
    },
    '预警 延期风险 检修令号',
  );

  await softCreate(
    R.actualHoursStats,
    { stats_code: 'AHS-A320-OVHL-NDT' },
    {
      stats_code: 'AHS-A320-OVHL-NDT',
      aircraft_model: 'A320',
      repair_type: 'OVERHAUL',
      card_template_code: 'WCT-NDT-PT',
      standard_hours: '6',
      average_actual_hours: '5.5',
      min_actual_hours: '4',
      max_actual_hours: '8',
      sample_count: 42,
      variance: '0.8',
      suggested_standard: '5.5',
    },
    '实际工时统计 NDT',
  );

  log('\n=== Seed 完成 ===');
  log(`主令号: ${orderNo} (workshopOrderId=${workshopOrder.id})`);
  log(`副令号: ${orderNo2} (workshopOrderId=${workshopOrder2.id})`);
  log(`工卡数(主): ${LEAF_SPECS.length}；BOP 方案: ${bopScheme.name ?? bopScheme.id}`);
  log('故检修理线工卡已绑定已有工位 F01~F05（未新增工位）');
  log('刷新前端即可验证：令号列表、WBS、游离池、工卡看板、故检修理线管道、齐套、甘特、负荷、预警、效能报告');
  log('测量检验演示数据请另跑: pnpm --filter @ips/backend run seed:inspection');
}

main().catch((e) => {
  console.error('[seed] 失败:', e);
  process.exit(1);
});

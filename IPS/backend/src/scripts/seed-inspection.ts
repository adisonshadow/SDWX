/**
 * 测量检验域演示数据（幂等）
 *
 * 范围：仅故检修理线 FAULT_REPAIR 已有工位 F01~F05 对应工序/工步。
 * - 不新建工位
 * - 强化检验点工步摘要；补 StepInstance
 * - 写入 MeasurementEquipment / InspectionItem / InspectionRecord（约 5% FAIL）
 *
 * 幂等：EADAF Find 按业务键匹配，命中则跳过。
 *
 * 用法：pnpm --filter @ips/backend run seed:inspection
 */
import { eadafClient } from '../eadaf/EADAFClient.js';
import { EADAF_ROUTES } from '@ips/shared';
import type {
  MeasurementEquipment,
  ProcessOperation,
  ProcessStep,
  StepInstance,
  WorkCard,
  Workstation,
} from '@ips/shared';

const R = EADAF_ROUTES;

function log(msg: string) {
  console.log(`[seed-inspection] ${msg}`);
}

function omitNullish(body: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== null && v !== undefined) cleaned[k] = v;
  }
  return cleaned;
}

/** Find 过滤命中则复用，否则 Create */
async function idempotentCreate<T extends { id?: string }>(
  routePath: string,
  filter: Record<string, unknown>,
  body: Record<string, unknown>,
  label: string,
): Promise<T> {
  const existing = await eadafClient.findFiltered<T>(routePath, filter, { limit: 50 });
  const precise = existing.items.find((it) =>
    Object.entries(filter).every(([k, v]) => (it as Record<string, unknown>)[k] === v),
  );
  if (precise) {
    log(`跳过: ${label}`);
    return precise;
  }
  const created = await eadafClient.create<T>(routePath, omitNullish(body), false);
  log(`创建: ${label} → ${created.id}`);
  return created;
}

/** F01~F05 对应工序编号 */
const FR_OP_NOS = new Set([
  'OP-MET-001',
  'OP-INSPECT-01',
  'OP-TST-001',
  'OP-TST-002',
  'OP-TST-003',
  'OP-NDT-001',
  'OP-NDT-002',
  'OP-REP-001',
  'OP-ASM-001',
  'OP-ASM-002',
  'OP-ASM-003',
  'OP-ASM-004',
  'OP-NR-001',
  'OP-NR-002',
  'OP-OUT-001',
  'OP-KIT-001',
]);

type ItemDef =
  | {
      name: string;
      inspectionType: 'manual';
      sortOrder: number;
      remark?: string;
    }
  | {
      name: string;
      inspectionType: 'tolerance';
      sortOrder: number;
      nominalValue: number;
      upperTolerance: number;
      lowerTolerance: number;
      unit: string;
      remark?: string;
    };

const ITEMS_BY_OP: Record<string, ItemDef[]> = {
  'OP-MET-001': [
    {
      name: '轴径测量',
      inspectionType: 'tolerance',
      sortOrder: 1,
      nominalValue: 45.0,
      upperTolerance: 0.02,
      lowerTolerance: -0.02,
      unit: 'mm',
      remark: '千分尺，室温 20±2℃',
    },
    {
      name: '配合间隙',
      inspectionType: 'tolerance',
      sortOrder: 2,
      nominalValue: 0.08,
      upperTolerance: 0.03,
      lowerTolerance: -0.02,
      unit: 'mm',
    },
    {
      name: '衬套磨损量目视',
      inspectionType: 'manual',
      sortOrder: 3,
      remark: '超限磨损记不合格并拍照',
    },
  ],
  'OP-INSPECT-01': [
    { name: '腐蚀/划伤目视', inspectionType: 'manual', sortOrder: 1, remark: '对照缺陷样板判定' },
    { name: '裂纹目视筛查', inspectionType: 'manual', sortOrder: 2 },
    {
      name: '表面粗糙度抽测',
      inspectionType: 'tolerance',
      sortOrder: 3,
      nominalValue: 1.6,
      upperTolerance: 0.4,
      lowerTolerance: -0.4,
      unit: 'μm',
    },
  ],
  'OP-NDT-001': [
    { name: 'PT 渗透显示判定', inspectionType: 'manual', sortOrder: 1, remark: '无线性显示为合格' },
    {
      name: '渗透剂停留时间',
      inspectionType: 'tolerance',
      sortOrder: 2,
      nominalValue: 20,
      upperTolerance: 5,
      lowerTolerance: -5,
      unit: 'min',
    },
  ],
  'OP-NDT-002': [
    {
      name: 'ET 信号幅值',
      inspectionType: 'tolerance',
      sortOrder: 1,
      nominalValue: 50,
      upperTolerance: 10,
      lowerTolerance: -10,
      unit: '%',
    },
    { name: '探头耦合目视', inspectionType: 'manual', sortOrder: 2 },
  ],
  'OP-TST-001': [
    {
      name: '保压压力',
      inspectionType: 'tolerance',
      sortOrder: 1,
      nominalValue: 21,
      upperTolerance: 0.5,
      lowerTolerance: -0.5,
      unit: 'MPa',
    },
    { name: '渗漏目视', inspectionType: 'manual', sortOrder: 2, remark: '无可见渗漏为合格' },
  ],
  'OP-TST-002': [
    { name: '收放循环次数达成', inspectionType: 'manual', sortOrder: 1, remark: '不少于 5 次无卡滞' },
    {
      name: '锁止力矩',
      inspectionType: 'tolerance',
      sortOrder: 2,
      nominalValue: 35,
      upperTolerance: 2,
      lowerTolerance: -2,
      unit: 'N·m',
    },
  ],
  'OP-TST-003': [
    { name: '全项符合性核对', inspectionType: 'manual', sortOrder: 1 },
    { name: '检验员签字确认', inspectionType: 'manual', sortOrder: 2 },
  ],
  'OP-REP-001': [
    {
      name: '打磨后余厚',
      inspectionType: 'tolerance',
      sortOrder: 1,
      nominalValue: 2.5,
      upperTolerance: 0.2,
      lowerTolerance: -0.1,
      unit: 'mm',
    },
    { name: '损伤去除目视', inspectionType: 'manual', sortOrder: 2 },
  ],
  'OP-ASM-004': [
    {
      name: '充氮压力',
      inspectionType: 'tolerance',
      sortOrder: 1,
      nominalValue: 3.5,
      upperTolerance: 0.1,
      lowerTolerance: -0.1,
      unit: 'MPa',
    },
    { name: '静态保压目视', inspectionType: 'manual', sortOrder: 2 },
  ],
};

const DEFAULT_ITEMS: ItemDef[] = [
  {
    name: '完工外观自检',
    inspectionType: 'manual',
    sortOrder: 1,
    remark: '故检修理线默认检验项',
  },
  {
    name: '关键尺寸抽测',
    inspectionType: 'tolerance',
    sortOrder: 2,
    nominalValue: 10,
    upperTolerance: 0.05,
    lowerTolerance: -0.05,
    unit: 'mm',
  },
];

function isFailSample(index: number): boolean {
  return index % 20 === 0;
}

function measuredForItem(
  item: ItemDef,
  fail: boolean,
  salt: number,
): { measuredValue?: number; result: string; defectDescription?: string } {
  if (item.inspectionType === 'manual') {
    if (fail) {
      return {
        result: 'FAIL',
        defectDescription: '目视发现超标缺陷（演示不合格样例）',
      };
    }
    return { result: 'PASS' };
  }
  const { nominalValue: nominal, upperTolerance: upper, lowerTolerance: lower, unit } = item;
  if (fail) {
    const measuredValue = Number(
      (nominal + upper + Math.abs(upper) * 0.5 + (salt % 7) * 0.01).toFixed(3),
    );
    return {
      measuredValue,
      result: 'FAIL',
      defectDescription: `测量值 ${measuredValue}${unit} 超出公差带（演示）`,
    };
  }
  const mid = (lower + upper) / 2;
  const measuredValue = Number((nominal + mid * 0.3 + ((salt % 5) - 2) * 0.001).toFixed(3));
  return { measuredValue, result: 'PASS' };
}

function inspectionSpecSummary(defs: ItemDef[]): string {
  return defs
    .map((d) =>
      d.inspectionType === 'tolerance'
        ? `${d.name}(${d.nominalValue}${d.unit} [${d.lowerTolerance},${d.upperTolerance}])`
        : `${d.name}(人工)`,
    )
    .join('；');
}

/** 清理此前 Find 探测留下的 __PROBE_* 设备 */
async function cleanupProbeEquipment() {
  const page = await eadafClient.find<MeasurementEquipment>(R.measurementEquipment, { limit: 100 });
  for (const eq of page.items) {
    const serial = (eq as { serialNo?: string }).serialNo || '';
    if (!eq.id) continue;
    if (serial.startsWith('__PROBE_') || (eq.name || '') === '__seed_probe__') {
      try {
        await eadafClient.deleteOne(R.measurementEquipment, eq.id);
        log(`清理探测设备 ${serial || eq.id}`);
      } catch (e) {
        log(`警告: 清理探测设备失败 ${serial}: ${(e as Error).message}`);
      }
    }
  }
}

async function main() {
  // 1) F01~F05
  const stationNos = ['F01', 'F02', 'F03', 'F04', 'F05'];
  const stations: Workstation[] = [];
  for (const no of stationNos) {
    const res = await eadafClient.findFiltered<Workstation>(R.workstation, { stationNo: no }, { limit: 1 });
    const ws = res.items[0];
    if (!ws?.id) {
      throw new Error(`缺少故检修理线工位 ${no}（本脚本不新建工位）`);
    }
    stations.push(ws);
    log(`绑定工位 ${no} ${ws.name}`);
  }
  const frWsIds = new Set(stations.map((s) => s.id!).filter(Boolean));

  // Find 冒烟
  const smoke = await eadafClient.find(R.measurementEquipment, { limit: 1 });
  log(`Find 正常（MeasurementEquipment total=${smoke.total ?? smoke.items.length}）`);
  await cleanupProbeEquipment();

  // 2) 测量设备
  const equipDefs = [
    { serialNo: 'ME-FR-MIC-01', name: '外径千分尺 0-25', model: '0-25mm/0.001', status: 'ACTIVE' },
    { serialNo: 'ME-FR-MIC-02', name: '外径千分尺 25-50', model: '25-50mm/0.001', status: 'ACTIVE' },
    { serialNo: 'ME-FR-TORQUE-01', name: '扭矩扳手', model: '10-50 N·m', status: 'ACTIVE' },
    { serialNo: 'ME-FR-ET-01', name: '涡流探伤仪', model: 'ET-200', status: 'ACTIVE' },
    { serialNo: 'ME-FR-PT-01', name: '荧光渗透套装', model: 'PT-Kit-A', status: 'IN_CALIBRATION' },
    { serialNo: 'ME-FR-PRESS-01', name: '精密压力表', model: '0-40 MPa', status: 'ACTIVE' },
  ];
  const equipment: MeasurementEquipment[] = [];
  for (const def of equipDefs) {
    const eq = await idempotentCreate<MeasurementEquipment>(
      R.measurementEquipment,
      { serialNo: def.serialNo },
      {
        ...def,
        calibrationDate: '2026-06-01T00:00:00.000Z',
        calibrationCycle: 365,
        remark: '故检修理线 F01~F05 演示量具',
      },
      `测量设备 ${def.serialNo}`,
    );
    if (eq.id) equipment.push(eq);
  }
  const activeEquip = equipment.filter((e) => e.status === 'ACTIVE' && e.id);

  // 3) FR 工序检验点 + 检验项
  const opsRes = await eadafClient.find<ProcessOperation>(R.processOperation, { limit: 100 });
  const frOps = opsRes.items.filter((op) => op.operationNo && FR_OP_NOS.has(op.operationNo));
  log(`故检线相关工序 ${frOps.length} 个`);

  const inspectStepByOpId = new Map<string, ProcessStep>();
  const itemsByStepId = new Map<string, { id: string; name: string; def: ItemDef }[]>();

  for (const op of frOps) {
    if (!op.id || !op.operationNo) continue;
    const defs = ITEMS_BY_OP[op.operationNo] ?? DEFAULT_ITEMS;
    const steps = await eadafClient.findFiltered<ProcessStep>(
      R.processStep,
      { operationId: op.id },
      { limit: 50 },
    );
    let s03 = steps.items.find((s) => s.stepNo === 'S03');
    if (!s03?.id) {
      s03 = await idempotentCreate<ProcessStep>(
        R.processStep,
        { operationId: op.id, stepNo: 'S03' },
        {
          operationId: op.id,
          stepNo: 'S03',
          sortOrder: 3,
          name: '测量检验放行',
          isInspectionPoint: true,
          isMandatoryInspection: true,
          inspectionSpec: inspectionSpecSummary(defs),
          standardHours: '0.5',
        },
        `工步 ${op.operationNo}/S03`,
      );
    } else {
      try {
        await eadafClient.update(R.processStep, s03.id, {
          isInspectionPoint: true,
          isMandatoryInspection: true,
          inspectionSpec: inspectionSpecSummary(defs),
        });
      } catch {
        /* ignore */
      }
    }
    if (!s03.id) continue;
    inspectStepByOpId.set(op.id, s03);

    const createdItems: { id: string; name: string; def: ItemDef }[] = [];
    for (const def of defs) {
      const body: Record<string, unknown> = {
        processStepId: s03.id,
        name: def.name,
        inspectionType: def.inspectionType,
        sortOrder: def.sortOrder,
      };
      if (def.remark) body.remark = def.remark;
      if (def.inspectionType === 'tolerance') {
        body.nominalValue = def.nominalValue;
        body.upperTolerance = def.upperTolerance;
        body.lowerTolerance = def.lowerTolerance;
        body.unit = def.unit;
      }
      const item = await idempotentCreate(
        R.inspectionItem,
        { processStepId: s03.id, name: def.name },
        body,
        `检验项 ${op.operationNo}/${def.name}`,
      );
      if (item.id) createdItems.push({ id: item.id, name: def.name, def });
    }
    itemsByStepId.set(s03.id, createdItems);
  }

  // 4) 工卡 → StepInstance + InspectionRecord
  const cardsByOpInstId = new Map<string, WorkCard>();
  {
    let skip = 0;
    while (skip < 800) {
      const page = await eadafClient.find<WorkCard>(R.workCard, { limit: 100, skip });
      for (const c of page.items) {
        if (
          c.operationInstanceId &&
          c.workstationId &&
          frWsIds.has(c.workstationId) &&
          (c.status === 'REPAIRING' ||
            c.status === 'REPAIR_DONE' ||
            c.status === 'PENDING_REPAIR' ||
            c.status === 'PENDING_ACCEPT')
        ) {
          cardsByOpInstId.set(c.operationInstanceId, c);
        }
      }
      if (page.items.length < 100) break;
      skip += 100;
    }
  }
  log(`故检线可录入检验的工卡 ${cardsByOpInstId.size} 张`);

  let recordIndex = 0;
  let failCount = 0;
  let passCount = 0;
  let stepInstCount = 0;
  let recordCreated = 0;

  for (const op of frOps) {
    if (!op.id || !op.operationNo) continue;
    const inspectStep = inspectStepByOpId.get(op.id);
    if (!inspectStep?.id) continue;
    const items = itemsByStepId.get(inspectStep.id) ?? [];

    const opInstPage = await eadafClient.findFiltered<{ id?: string }>(
      R.operationInstance,
      { processOperationId: op.id },
      { limit: 100 },
    );

    for (const opInst of opInstPage.items) {
      if (!opInst.id) continue;
      const card = cardsByOpInstId.get(opInst.id);
      if (!card) continue;

      const stepInst = await idempotentCreate<StepInstance>(
        R.stepInstance,
        { operationInstanceId: opInst.id, stepNo: inspectStep.stepNo || 'S03' },
        {
          operationInstanceId: opInst.id,
          processStepId: inspectStep.id,
          stepNo: inspectStep.stepNo || 'S03',
          name: inspectStep.name || '测量检验',
          isInspectionPoint: true,
          status:
            card.status === 'REPAIR_DONE'
              ? 'DONE'
              : card.status === 'REPAIRING'
                ? 'IN_PROGRESS'
                : 'PENDING',
          inspectionResult: 'PENDING',
        },
        `工步实例 ${card.workCardNo}/${inspectStep.stepNo}`,
      );
      if (!stepInst.id) continue;
      stepInstCount += 1;
      if (items.length === 0) continue;

      const itemResults: string[] = [];
      for (const item of items) {
        const fail = isFailSample(recordIndex);
        recordIndex += 1;
        const measured = measuredForItem(item.def, fail, recordIndex);
        if (fail) failCount += 1;
        else passCount += 1;
        itemResults.push(measured.result);

        const equip = activeEquip.length
          ? activeEquip[recordIndex % activeEquip.length]
          : undefined;

        const before = await eadafClient.findFiltered(
          R.inspectionRecord,
          { stepInstanceId: stepInst.id, inspectionItemId: item.id },
          { limit: 5 },
        );
        const existed = before.items.find(
          (r: any) =>
            r.stepInstanceId === stepInst.id && r.inspectionItemId === item.id,
        );
        if (existed) {
          log(`跳过: 检验记录 ${card.workCardNo}/${item.name}`);
        } else {
          await eadafClient.create(
            R.inspectionRecord,
            omitNullish({
              stepInstanceId: stepInst.id,
              inspectionItemId: item.id,
              measuredValue: measured.measuredValue,
              result: measured.result,
              defectDescription: measured.defectDescription,
              equipmentId: equip?.id,
              inspector: fail ? '张检' : '李检',
              inspectedAt: new Date(
                Date.UTC(2026, 6, 20 + (recordIndex % 5), 8 + (recordIndex % 8), 15),
              ).toISOString(),
              imageUrls: fail
                ? { '0': 'https://example.local/ips/demo/defect-sample.jpg' }
                : undefined,
            }),
            false,
          );
          recordCreated += 1;
          log(`创建: 检验记录 ${card.workCardNo}/${item.name}`);
        }
      }

      let stepResult = 'PENDING';
      if (itemResults.some((r) => r === 'FAIL')) stepResult = 'FAIL';
      else if (itemResults.length > 0 && itemResults.every((r) => r === 'PASS')) stepResult = 'PASS';

      try {
        await eadafClient.update(R.stepInstance, stepInst.id, { inspectionResult: stepResult });
      } catch (e) {
        log(`警告: 更新工步实例结果失败 ${card.workCardNo}: ${(e as Error).message}`);
      }
    }
  }

  const eqTotal = (await eadafClient.find(R.measurementEquipment, { limit: 1 })).total ?? 0;
  const itemTotal = (await eadafClient.find(R.inspectionItem, { limit: 1 })).total ?? 0;
  const recPage = await eadafClient.find(R.inspectionRecord, { limit: 100 });
  const recFail = recPage.items.filter((r: any) => r.result === 'FAIL').length;
  const recPass = recPage.items.filter((r: any) => r.result === 'PASS').length;
  const recTotal = recPage.total ?? recPage.items.length;
  const failRate = recFail + recPass > 0 ? ((recFail / (recFail + recPass)) * 100).toFixed(1) : '0';

  log(
    `完成：设备 ${eqTotal}；检验项 ${itemTotal}；工步实例 ${stepInstCount}；本轮新建记录 ${recordCreated}；库内记录 ${recTotal}（FAIL ${recFail} / PASS ${recPass}，约 ${failRate}%）`,
  );
  log('前端可验证：/master/measurement-equipment、/dispatch/inspection-records、工卡详情检验 Drawer');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

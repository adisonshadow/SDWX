/**
 * 仅回填标准工序的工步 / DAG 边 / 物料挂载（幂等）。
 * 用法：pnpm --filter @ips/backend exec tsx src/scripts/seed-process-steps.ts
 */
import { eadafClient } from '../eadaf/EADAFClient.js';
import { EADAF_ROUTES } from '@ips/shared';
import type { Material, ProcessOperation } from '@ips/shared';

const R = EADAF_ROUTES;

function log(msg: string) {
  console.log(`[seed-steps] ${msg}`);
}

async function idempotentCreate<T extends { id?: string }>(
  routePath: string,
  filter: Record<string, unknown>,
  body: Record<string, unknown>,
  label: string,
): Promise<T> {
  const existing = await eadafClient.findFiltered<T>(routePath, filter, { limit: 1 });
  if (existing.items[0]) {
    log(`跳过: ${label}`);
    return existing.items[0];
  }
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== null && v !== undefined) cleaned[k] = v;
  }
  const created = await eadafClient.create<T>(routePath, cleaned, false);
  log(`创建: ${label} → ${created.id}`);
  return created;
}

async function seedOne(op: ProcessOperation, mats: Record<string, Material | undefined>) {
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
    `${op.operationNo}/S01`,
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
    `${op.operationNo}/S02`,
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
    `${op.operationNo}/S03`,
  );
  if (s01.id && s02.id) {
    await idempotentCreate(
      R.processStepEdge,
      { fromStepId: s01.id, toStepId: s02.id },
      { fromStepId: s01.id, toStepId: s02.id, edgeType: 'NORMAL' },
      `${op.operationNo} S01→S02`,
    );
  }
  if (s02.id && s03.id) {
    await idempotentCreate(
      R.processStepEdge,
      { fromStepId: s02.id, toStepId: s03.id, edgeType: 'NORMAL' },
      { fromStepId: s02.id, toStepId: s03.id, edgeType: 'NORMAL' },
      `${op.operationNo} S02→S03`,
    );
    await idempotentCreate(
      R.processStepEdge,
      { fromStepId: s03.id, toStepId: s02.id, edgeType: 'FAIL' },
      { fromStepId: s03.id, toStepId: s02.id, edgeType: 'FAIL' },
      `${op.operationNo} S03→S02 FAIL`,
    );
  }

  const seal = mats.seal;
  const plate = mats.plate;
  const pin = mats.pin;
  if (seal?.id && (op.kitRequired || op.operationNo?.startsWith('OP-KIT') || op.operationNo?.startsWith('OP-ASM'))) {
    await idempotentCreate(
      R.processOperationMaterial,
      { operationId: op.id, materialId: seal.id },
      {
        operationId: op.id,
        materialId: seal.id,
        quantity: op.operationNo?.startsWith('OP-KIT') ? 12 : 2,
        isCollaboration: false,
        kitCheck: !!op.kitRequired,
      },
      `${op.operationNo}/密封圈`,
    );
  }
  if (plate?.id && (op.operationNo?.startsWith('OP-OUT') || op.operationNo?.startsWith('OP-REP'))) {
    await idempotentCreate(
      R.processOperationMaterial,
      { operationId: op.id, materialId: plate.id },
      {
        operationId: op.id,
        materialId: plate.id,
        quantity: 1,
        isCollaboration: true,
        kitCheck: true,
      },
      `${op.operationNo}/电镀协作件`,
    );
  }
  if (pin?.id && (op.operationNo?.startsWith('OP-ASM') || op.operationNo?.startsWith('OP-DIS'))) {
    await idempotentCreate(
      R.processOperationMaterial,
      { operationId: op.id, materialId: pin.id },
      {
        operationId: op.id,
        materialId: pin.id,
        quantity: 4,
        isCollaboration: false,
        kitCheck: false,
      },
      `${op.operationNo}/销轴`,
    );
  }
}

async function main() {
  const ops = await eadafClient.find<ProcessOperation>(R.processOperation, { limit: 100 });
  log(`工序数: ${ops.items.length}`);
  const [seal, plate, pin] = await Promise.all([
    eadafClient.findFiltered<Material>(R.material, { materialNo: 'MAT-LG-SEAL' }, { limit: 1 }),
    eadafClient.findFiltered<Material>(R.material, { materialNo: 'MAT-LG-PLATE' }, { limit: 1 }),
    eadafClient.findFiltered<Material>(R.material, { materialNo: 'MAT-LG-PIN' }, { limit: 1 }),
  ]);
  const mats = {
    seal: seal.items[0],
    plate: plate.items[0],
    pin: pin.items[0],
  };
  for (const op of ops.items) {
    // 跳过探测用临时工步污染的工序也一并规范化（S01/S02/S03 幂等）
    await seedOne(op, mats);
  }
  log('完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

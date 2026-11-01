/**
 * IPS 全部业务实体（单文件）
 * - 实体注册码：static code = 'ips:{scope}:{EntityName}'
 * - 枚举见 ./enums.ts；字段 type: 'adb-enum' + enumCode（禁止 varchar 表示枚举）
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Tree,
  TreeChildren,
  TreeParent,
  UpdateDateColumn,
} from 'typeorm';
import {
  DagEdgeTypeEnum,
  HalfDayEnum,
  InspectionResultEnum,
  KitDimensionEnum,
  MaterialNodeTypeEnum,
  OperationCategoryEnum,
  OutsourcingStatusEnum,
  RepairMethodEnum,
  ResourceTypeEnum,
  SchedulePriorityEnum,
  StepInstanceStatusEnum,
  VersionStatusEnum,
  WorkAreaTypeEnum,
  WorkCardStatusEnum,
  WorkshopOrderStatusEnum,
} from './enums';

/** ADB 枚举列选项 */
export type AdbEnumColumnOptions = {
  type: 'adb-enum';
  enumCode: string;
  nullable?: boolean;
  comment?: string;
  default?: string;
};

export function adbEnumColumn(
  enumCode: string,
  extra?: Omit<AdbEnumColumnOptions, 'type' | 'enumCode'>,
): AdbEnumColumnOptions {
  return { type: 'adb-enum', enumCode, ...extra };
}

/** 业务实体基类（entityCode 写在各实体 static code 上，非行字段） */
export abstract class IpsBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '业务编号/可读编号' })
  bizNo?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true, comment: '名称' })
  name?: string | null;

  @Column({ type: 'text', nullable: true })
  remark?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

// ═══════════════════════════════════════════
// master
// ═══════════════════════════════════════════

/** ips:master:Product */
@Entity({ name: 'ips_product' })
export class Product extends IpsBaseEntity {
  static readonly code = 'ips:master:Product';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, comment: '产品编号' })
  productNo!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '型号' })
  model?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '制造批架次号' })
  batchSerial?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '履历本编号' })
  historyBookNo?: string | null;
}

/** ips:master:Material */
@Entity({ name: 'ips_material' })
export class Material extends IpsBaseEntity {
  static readonly code = 'ips:master:Material';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  materialNo!: string;

  @Column({ ...adbEnumColumn(MaterialNodeTypeEnum.code, { comment: '物料类型' }) } as any)
  nodeType!: string;

  @Column({ type: 'boolean', default: false, comment: '是否独立修理项' })
  independentRepair!: boolean;
}

/** ips:master:Workstation */
@Entity({ name: 'ips_workstation' })
@Index(['areaType', 'stationNo'], { unique: true })
export class Workstation extends IpsBaseEntity {
  static readonly code = 'ips:master:Workstation';

  @Column({ type: 'varchar', length: 64 })
  stationNo!: string;

  @Column({ ...adbEnumColumn(WorkAreaTypeEnum.code, { comment: '区站类型' }) } as any)
  areaType!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 8, comment: '标准日负荷工时' })
  dailyLoadHours!: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 2, comment: '管道容量系数' })
  pipelineCapacityFactor!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @OneToMany(() => RepairResource, (r) => r.defaultWorkstation)
  resources?: RepairResource[];
}

/** ips:master:RepairResource */
@Entity({ name: 'ips_repair_resource' })
export class RepairResource extends IpsBaseEntity {
  static readonly code = 'ips:master:RepairResource';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  resourceNo!: string;

  @Column({ ...adbEnumColumn(ResourceTypeEnum.code) } as any)
  resourceType!: string;

  @Column({ type: 'uuid', nullable: true })
  defaultWorkstationId?: string | null;

  @ManyToOne(() => Workstation, (w) => w.resources, { nullable: true })
  @JoinColumn({ name: 'defaultWorkstationId' })
  defaultWorkstation?: Workstation | null;
}

// ═══════════════════════════════════════════
// process
// ═══════════════════════════════════════════

/** ips:process:ProcessOperation */
@Entity({ name: 'ips_process_operation' })
export class ProcessOperation extends IpsBaseEntity {
  static readonly code = 'ips:process:ProcessOperation';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  operationNo!: string;

  @Column({ type: 'int', default: 1, comment: '版本号' })
  version!: number;

  @Column({ ...adbEnumColumn(VersionStatusEnum.code, { default: 'DRAFT' }) } as any)
  versionStatus!: string;

  @Column({ ...adbEnumColumn(OperationCategoryEnum.code, { default: 'ROUTINE' }) } as any)
  category!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '标准工时(小时)' })
  standardHours?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '准备工时' })
  prepareHours?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '辅助工时' })
  assistHours?: string | null;

  @Column({ type: 'boolean', default: true, comment: '是否齐套性工序/工卡' })
  kitRequired!: boolean;

  @Column({ type: 'uuid', nullable: true, comment: '默认目标工位' })
  defaultWorkstationId?: string | null;

  @ManyToOne(() => Workstation, { nullable: true })
  @JoinColumn({ name: 'defaultWorkstationId' })
  defaultWorkstation?: Workstation | null;

  @OneToMany(() => ProcessStep, (s) => s.operation)
  steps?: ProcessStep[];

  @OneToMany(() => ProcessOperationMaterial, (m) => m.operation)
  materials?: ProcessOperationMaterial[];
}

/** ips:process:ProcessStep */
@Entity({ name: 'ips_process_step' })
@Index(['operationId', 'stepNo'], { unique: true })
export class ProcessStep extends IpsBaseEntity {
  static readonly code = 'ips:process:ProcessStep';

  @Column({ type: 'uuid' })
  operationId!: string;

  @ManyToOne(() => ProcessOperation, (op) => op.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'operationId' })
  operation!: ProcessOperation;

  @Column({ type: 'varchar', length: 64 })
  stepNo!: string;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: false, comment: '是否检验点' })
  isInspectionPoint!: boolean;

  @Column({ type: 'boolean', default: false, comment: '是否强制检验点' })
  isMandatoryInspection!: boolean;

  @Column({ type: 'text', nullable: true, comment: '检验项目/验收标准摘要' })
  inspectionSpec?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  standardHours?: string | null;

  @OneToMany(() => ProcessStepEdge, (e) => e.fromStep)
  outEdges?: ProcessStepEdge[];
}

/** ips:process:ProcessStepEdge */
@Entity({ name: 'ips_process_step_edge' })
@Index(['fromStepId', 'toStepId', 'edgeType'], { unique: true })
export class ProcessStepEdge extends IpsBaseEntity {
  static readonly code = 'ips:process:ProcessStepEdge';

  @Column({ type: 'uuid' })
  fromStepId!: string;

  @Column({ type: 'uuid' })
  toStepId!: string;

  @ManyToOne(() => ProcessStep, (s) => s.outEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromStepId' })
  fromStep!: ProcessStep;

  @ManyToOne(() => ProcessStep, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toStepId' })
  toStep!: ProcessStep;

  @Column({ ...adbEnumColumn(DagEdgeTypeEnum.code, { default: 'NORMAL' }) } as any)
  edgeType!: string;
}

/** ips:process:ProcessOperationMaterial */
@Entity({ name: 'ips_process_operation_material' })
export class ProcessOperationMaterial extends IpsBaseEntity {
  static readonly code = 'ips:process:ProcessOperationMaterial';

  @Column({ type: 'uuid' })
  operationId!: string;

  @ManyToOne(() => ProcessOperation, (op) => op.materials, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'operationId' })
  operation!: ProcessOperation;

  @Column({ type: 'uuid' })
  materialId!: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'materialId' })
  material!: Material;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 1 })
  quantity!: string;

  @Column({ type: 'boolean', default: false, comment: '是否协作件/委外件' })
  isCollaboration!: boolean;

  @Column({ type: 'boolean', default: true, comment: '是否参与齐套校验' })
  kitCheck!: boolean;
}

/** ips:process:BopScheme */
@Entity({ name: 'ips_bop_scheme' })
@Index(['productModel', 'repairMethod', 'version'], { unique: true })
export class BopScheme extends IpsBaseEntity {
  static readonly code = 'ips:process:BopScheme';

  @Column({ type: 'varchar', length: 64, comment: '适用装备型号' })
  productModel!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '适用制造批架次' })
  batchSerial?: string | null;

  @Column({ ...adbEnumColumn(RepairMethodEnum.code) } as any)
  repairMethod!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ ...adbEnumColumn(VersionStatusEnum.code, { default: 'DRAFT' }) } as any)
  versionStatus!: string;

  @Column({ type: 'uuid', nullable: true, comment: '关联BOM方案' })
  bomSchemeId?: string | null;

  @Column({ type: 'uuid', nullable: true, comment: '克隆来源BOP方案' })
  clonedFromId?: string | null;

  @OneToMany(() => BopOperationNode, (n) => n.bopScheme)
  operationNodes?: BopOperationNode[];

  @OneToMany(() => BopOperationEdge, (e) => e.bopScheme)
  operationEdges?: BopOperationEdge[];
}

/** ips:process:BopOperationNode */
@Entity({ name: 'ips_bop_operation_node' })
@Index(['bopSchemeId', 'nodeNo'], { unique: true })
export class BopOperationNode extends IpsBaseEntity {
  static readonly code = 'ips:process:BopOperationNode';

  @Column({ type: 'uuid' })
  bopSchemeId!: string;

  @ManyToOne(() => BopScheme, (s) => s.operationNodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bopSchemeId' })
  bopScheme!: BopScheme;

  @Column({ type: 'varchar', length: 64 })
  nodeNo!: string;

  @Column({ type: 'uuid' })
  operationId!: string;

  @ManyToOne(() => ProcessOperation)
  @JoinColumn({ name: 'operationId' })
  operation!: ProcessOperation;

  @Column({ type: 'uuid', nullable: true, comment: '关联BOM根/物料' })
  materialId?: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}

/** ips:process:BopOperationEdge */
@Entity({ name: 'ips_bop_operation_edge' })
@Index(['bopSchemeId', 'fromNodeId', 'toNodeId', 'edgeType'], { unique: true })
export class BopOperationEdge extends IpsBaseEntity {
  static readonly code = 'ips:process:BopOperationEdge';

  @Column({ type: 'uuid' })
  bopSchemeId!: string;

  @ManyToOne(() => BopScheme, (s) => s.operationEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bopSchemeId' })
  bopScheme!: BopScheme;

  @Column({ type: 'uuid' })
  fromNodeId!: string;

  @Column({ type: 'uuid' })
  toNodeId!: string;

  @ManyToOne(() => BopOperationNode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromNodeId' })
  fromNode!: BopOperationNode;

  @ManyToOne(() => BopOperationNode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toNodeId' })
  toNode!: BopOperationNode;

  @Column({ ...adbEnumColumn(DagEdgeTypeEnum.code, { default: 'NORMAL' }) } as any)
  edgeType!: string;
}

// ═══════════════════════════════════════════
// bom
// ═══════════════════════════════════════════

/** ips:bom:BomScheme */
@Entity({ name: 'ips_bom_scheme' })
@Index(['productModel', 'version'], { unique: true })
export class BomScheme extends IpsBaseEntity {
  static readonly code = 'ips:bom:BomScheme';

  @Column({ type: 'varchar', length: 64 })
  productModel!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ ...adbEnumColumn(VersionStatusEnum.code, { default: 'DRAFT' }) } as any)
  versionStatus!: string;

  @OneToMany(() => BomSchemeNode, (n) => n.bomScheme)
  nodes?: BomSchemeNode[];
}

/** ips:bom:BomSchemeNode */
@Entity({ name: 'ips_bom_scheme_node' })
@Tree('materialized-path')
export class BomSchemeNode extends IpsBaseEntity {
  static readonly code = 'ips:bom:BomSchemeNode';

  @Column({ type: 'uuid' })
  bomSchemeId!: string;

  @ManyToOne(() => BomScheme, (s) => s.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bomSchemeId' })
  bomScheme!: BomScheme;

  @Column({ type: 'uuid', nullable: true })
  materialId?: string | null;

  @ManyToOne(() => Material, { nullable: true })
  @JoinColumn({ name: 'materialId' })
  material?: Material | null;

  @Column({ ...adbEnumColumn(MaterialNodeTypeEnum.code) } as any)
  nodeType!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 1 })
  quantity!: string;

  @TreeParent()
  parent?: BomSchemeNode | null;

  @TreeChildren()
  children?: BomSchemeNode[];
}

// ═══════════════════════════════════════════
// production
// ═══════════════════════════════════════════

/** ips:production:FactoryOrder */
@Entity({ name: 'ips_factory_order' })
export class FactoryOrder extends IpsBaseEntity {
  static readonly code = 'ips:production:FactoryOrder';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  factoryOrderNo!: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '飞机相关标识' })
  aircraftRef?: string | null;

  @OneToMany(() => WorkshopOrder, (o) => o.factoryOrder)
  workshopOrders?: WorkshopOrder[];
}

/** ips:production:WorkshopOrder */
@Entity({ name: 'ips_workshop_order' })
export class WorkshopOrder extends IpsBaseEntity {
  static readonly code = 'ips:production:WorkshopOrder';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  workshopOrderNo!: string;

  @Column({ type: 'uuid' })
  factoryOrderId!: string;

  @ManyToOne(() => FactoryOrder, (f) => f.workshopOrders)
  @JoinColumn({ name: 'factoryOrderId' })
  factoryOrder!: FactoryOrder;

  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ ...adbEnumColumn(RepairMethodEnum.code) } as any)
  repairMethod!: string;

  @Column({ type: 'uuid', nullable: true, comment: '选用的BOP方案' })
  bopSchemeId?: string | null;

  @ManyToOne(() => BopScheme, { nullable: true })
  @JoinColumn({ name: 'bopSchemeId' })
  bopScheme?: BopScheme | null;

  @Column({ type: 'date', nullable: true, comment: '计划投产开始日期' })
  planStartDate?: string | null;

  @Column({ type: 'date', nullable: true, comment: '计划投产结束日期' })
  planEndDate?: string | null;

  @Column({ ...adbEnumColumn(WorkshopOrderStatusEnum.code, { default: 'CREATED' }) } as any)
  status!: string;

  @OneToOne(() => SingleUnitPlan, (p) => p.workshopOrder)
  singleUnitPlan?: SingleUnitPlan;

  @OneToMany(() => WorkCard, (c) => c.workshopOrder)
  workCards?: WorkCard[];
}

/** ips:production:BomInstance */
@Entity({ name: 'ips_bom_instance' })
export class BomInstance extends IpsBaseEntity {
  static readonly code = 'ips:production:BomInstance';

  @Column({ type: 'uuid' })
  workshopOrderId!: string;

  @Column({ type: 'uuid', nullable: true })
  bomSchemeId?: string | null;

  @ManyToOne(() => BomScheme, { nullable: true })
  @JoinColumn({ name: 'bomSchemeId' })
  bomScheme?: BomScheme | null;

  @Column({ type: 'int', nullable: true, comment: '冻结的模板版本' })
  frozenSchemeVersion?: number | null;

  @OneToMany(() => BomInstanceNode, (n) => n.bomInstance)
  nodes?: BomInstanceNode[];
}

/** ips:production:BomInstanceNode */
@Entity({ name: 'ips_bom_instance_node' })
export class BomInstanceNode extends IpsBaseEntity {
  static readonly code = 'ips:production:BomInstanceNode';

  @Column({ type: 'uuid' })
  bomInstanceId!: string;

  @ManyToOne(() => BomInstance, (i) => i.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bomInstanceId' })
  bomInstance!: BomInstance;

  @Column({ type: 'uuid', nullable: true })
  parentId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  materialId?: string | null;

  @ManyToOne(() => Material, { nullable: true })
  @JoinColumn({ name: 'materialId' })
  material?: Material | null;

  @Column({ ...adbEnumColumn(MaterialNodeTypeEnum.code) } as any)
  nodeType!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 1 })
  quantity!: string;
}

/** ips:production:BopInstance */
@Entity({ name: 'ips_bop_instance' })
export class BopInstance extends IpsBaseEntity {
  static readonly code = 'ips:production:BopInstance';

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  workshopOrderId!: string;

  @Column({ type: 'uuid' })
  bopSchemeId!: string;

  @ManyToOne(() => BopScheme)
  @JoinColumn({ name: 'bopSchemeId' })
  bopScheme!: BopScheme;

  @Column({ type: 'int', comment: '冻结的BOP方案版本' })
  frozenSchemeVersion!: number;

  @Column({ type: 'uuid', nullable: true })
  bomInstanceId?: string | null;

  @OneToMany(() => OperationInstance, (o) => o.bopInstance)
  operations?: OperationInstance[];
}

/** ips:production:OperationInstance */
@Entity({ name: 'ips_operation_instance' })
export class OperationInstance extends IpsBaseEntity {
  static readonly code = 'ips:production:OperationInstance';

  @Column({ type: 'uuid' })
  bopInstanceId!: string;

  @ManyToOne(() => BopInstance, (b) => b.operations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bopInstanceId' })
  bopInstance!: BopInstance;

  @Column({ type: 'uuid' })
  processOperationId!: string;

  @ManyToOne(() => ProcessOperation)
  @JoinColumn({ name: 'processOperationId' })
  processOperation!: ProcessOperation;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '来源BOP节点编号' })
  sourceNodeNo?: string | null;

  @Column({ type: 'boolean', default: true, comment: '是否例行' })
  isRoutine!: boolean;

  @OneToOne(() => WorkCard, (c) => c.operationInstance)
  workCard?: WorkCard;

  @OneToMany(() => StepInstance, (s) => s.operationInstance)
  steps?: StepInstance[];
}

/** ips:production:StepInstance */
@Entity({ name: 'ips_step_instance' })
export class StepInstance extends IpsBaseEntity {
  static readonly code = 'ips:production:StepInstance';

  @Column({ type: 'uuid' })
  operationInstanceId!: string;

  @ManyToOne(() => OperationInstance, (o) => o.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'operationInstanceId' })
  operationInstance!: OperationInstance;

  @Column({ type: 'uuid', nullable: true })
  processStepId?: string | null;

  @ManyToOne(() => ProcessStep, { nullable: true })
  @JoinColumn({ name: 'processStepId' })
  processStep?: ProcessStep | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  stepNo?: string | null;

  @Column({ type: 'boolean', default: false })
  isInspectionPoint!: boolean;

  @Column({ ...adbEnumColumn(StepInstanceStatusEnum.code, { default: 'PENDING' }) } as any)
  status!: string;

  @Column({ ...adbEnumColumn(InspectionResultEnum.code, { nullable: true }) } as any)
  inspectionResult?: string | null;
}

/** ips:production:WorkCard */
@Entity({ name: 'ips_work_card' })
export class WorkCard extends IpsBaseEntity {
  static readonly code = 'ips:production:WorkCard';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  workCardNo!: string;

  @Column({ type: 'uuid' })
  workshopOrderId!: string;

  @ManyToOne(() => WorkshopOrder, (o) => o.workCards)
  @JoinColumn({ name: 'workshopOrderId' })
  workshopOrder!: WorkshopOrder;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  operationInstanceId!: string;

  @OneToOne(() => OperationInstance, (o) => o.workCard)
  @JoinColumn({ name: 'operationInstanceId' })
  operationInstance!: OperationInstance;

  @Column({ type: 'uuid', nullable: true })
  bopInstanceId?: string | null;

  @Column({ ...adbEnumColumn(WorkCardStatusEnum.code, { default: 'PENDING_EFFECTIVE' }) } as any)
  status!: string;

  @Column({ type: 'boolean', default: true, comment: '例行工卡' })
  isRoutine!: boolean;

  @Column({ type: 'boolean', default: true, comment: '齐套性工卡' })
  kitRequired!: boolean;

  @Column({ ...adbEnumColumn(SchedulePriorityEnum.code, { default: 'ROUTINE' }) } as any)
  priority!: string;

  @Column({ type: 'uuid', nullable: true, comment: '目标/所属工位' })
  workstationId?: string | null;

  @ManyToOne(() => Workstation, { nullable: true })
  @JoinColumn({ name: 'workstationId' })
  workstation?: Workstation | null;

  @Column({ type: 'int', nullable: true, comment: '工位栈式管道序号' })
  pipelineOrder?: number | null;

  @Column({ type: 'boolean', default: false, comment: '当前是否占用管道名额' })
  occupiesPipeline!: boolean;

  @Column({ type: 'date', nullable: true })
  plannedDate?: string | null;

  @Column({ ...adbEnumColumn(HalfDayEnum.code, { nullable: true }) } as any)
  plannedHalfDay?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '配置标准工时' })
  standardHours?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '选用工时' })
  selectedHours?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '实际工时' })
  actualHours?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  repairStartedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  repairFinishedAt?: Date | null;

  @OneToOne(() => WorkCardTask, (t) => t.workCard)
  task?: WorkCardTask;

  @OneToMany(() => WorkCardEdge, (e) => e.fromWorkCard)
  outEdges?: WorkCardEdge[];

  @OneToMany(() => WorkCardKitRequirement, (k) => k.workCard)
  kitRequirements?: WorkCardKitRequirement[];

  @OneToMany(() => WorkCardOutsourcing, (o) => o.workCard)
  outsourcings?: WorkCardOutsourcing[];
}

/** ips:production:WorkCardEdge */
@Entity({ name: 'ips_work_card_edge' })
@Index(['fromWorkCardId', 'toWorkCardId', 'edgeType'], { unique: true })
export class WorkCardEdge extends IpsBaseEntity {
  static readonly code = 'ips:production:WorkCardEdge';

  @Column({ type: 'uuid' })
  fromWorkCardId!: string;

  @Column({ type: 'uuid' })
  toWorkCardId!: string;

  @ManyToOne(() => WorkCard, (c) => c.outEdges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromWorkCardId' })
  fromWorkCard!: WorkCard;

  @ManyToOne(() => WorkCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toWorkCardId' })
  toWorkCard!: WorkCard;

  @Column({ ...adbEnumColumn(DagEdgeTypeEnum.code, { default: 'NORMAL' }) } as any)
  edgeType!: string;

  @Column({ type: 'boolean', default: true, comment: '是否强制前置(影响Head)' })
  isMandatory!: boolean;
}

/** ips:production:WorkCardTask */
@Entity({ name: 'ips_work_card_task' })
export class WorkCardTask extends IpsBaseEntity {
  static readonly code = 'ips:production:WorkCardTask';

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  workCardId!: string;

  @OneToOne(() => WorkCard, (c) => c.task)
  @JoinColumn({ name: 'workCardId' })
  workCard!: WorkCard;

  @Column({ type: 'uuid' })
  singleUnitPlanId!: string;

  @ManyToOne(() => SingleUnitPlan, (p) => p.tasks)
  @JoinColumn({ name: 'singleUnitPlanId' })
  singleUnitPlan!: SingleUnitPlan;

  @Column({ type: 'date', nullable: true })
  plannedDate?: string | null;

  @Column({ ...adbEnumColumn(HalfDayEnum.code, { nullable: true }) } as any)
  plannedHalfDay?: string | null;

  @Column({ type: 'int', default: 0, comment: 'WBS排序' })
  wbsOrder!: number;
}

/** ips:production:SingleUnitPlan */
@Entity({ name: 'ips_single_unit_plan' })
export class SingleUnitPlan extends IpsBaseEntity {
  static readonly code = 'ips:production:SingleUnitPlan';

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  workshopOrderId!: string;

  @OneToOne(() => WorkshopOrder, (o) => o.singleUnitPlan)
  @JoinColumn({ name: 'workshopOrderId' })
  workshopOrder!: WorkshopOrder;

  @OneToMany(() => WorkCardTask, (t) => t.singleUnitPlan)
  tasks?: WorkCardTask[];
}

/** ips:production:WorkCardOutsourcing — 工卡内委外，不整链挂起 */
@Entity({ name: 'ips_work_card_outsourcing' })
export class WorkCardOutsourcing extends IpsBaseEntity {
  static readonly code = 'ips:production:WorkCardOutsourcing';

  @Column({ type: 'uuid' })
  workCardId!: string;

  @ManyToOne(() => WorkCard, (c) => c.outsourcings)
  @JoinColumn({ name: 'workCardId' })
  workCard!: WorkCard;

  @Column({ type: 'uuid', nullable: true })
  materialId?: string | null;

  @ManyToOne(() => Material, { nullable: true })
  @JoinColumn({ name: 'materialId' })
  material?: Material | null;

  @Column({ ...adbEnumColumn(OutsourcingStatusEnum.code, { default: 'ISSUED' }) } as any)
  status!: string;

  @Column({ type: 'timestamptz', nullable: true })
  issuedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null;
}

/** ips:production:WorkCardKitRequirement */
@Entity({ name: 'ips_work_card_kit_requirement' })
export class WorkCardKitRequirement extends IpsBaseEntity {
  static readonly code = 'ips:production:WorkCardKitRequirement';

  @Column({ type: 'uuid' })
  workCardId!: string;

  @ManyToOne(() => WorkCard, (c) => c.kitRequirements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workCardId' })
  workCard!: WorkCard;

  @Column({ ...adbEnumColumn(KitDimensionEnum.code) } as any)
  dimension!: string;

  @Column({ type: 'uuid', nullable: true })
  materialId?: string | null;

  @Column({ type: 'uuid', nullable: true, comment: '依赖委外；须 ACCEPTED 才齐套' })
  outsourcingId?: string | null;

  @ManyToOne(() => WorkCardOutsourcing, { nullable: true })
  @JoinColumn({ name: 'outsourcingId' })
  outsourcing?: WorkCardOutsourcing | null;

  @Column({ type: 'boolean', default: false, comment: '当前是否已满足' })
  satisfied!: boolean;
}

// ═══════════════════════════════════════════
// schedule
// ═══════════════════════════════════════════

/** ips:schedule:ScheduleConfig — 挂起自动释放管道名额，无开关字段 */
@Entity({ name: 'ips_schedule_config' })
export class ScheduleConfig extends IpsBaseEntity {
  static readonly code = 'ips:schedule:ScheduleConfig';

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, default: 'DEFAULT' })
  configKey!: string;

  @Column({ type: 'boolean', default: false, comment: '是否包含周六' })
  includeSaturday!: boolean;

  @Column({ type: 'boolean', default: false, comment: '是否包含周日' })
  includeSunday!: boolean;

  @Column({ type: 'varchar', length: 16, default: '08:00' })
  amStart!: string;

  @Column({ type: 'varchar', length: 16, default: '12:00' })
  amEnd!: string;

  @Column({ type: 'varchar', length: 16, default: '13:00' })
  pmStart!: string;

  @Column({ type: 'varchar', length: 16, default: '17:00' })
  pmEnd!: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 2, comment: '管道容量系数' })
  pipelineCapacityFactor!: string;

  @Column({ type: 'int', default: 4, comment: '自动生效前瞻窗口(0.5天个数)' })
  effectiveLookaheadSlots!: number;

  @Column({ type: 'boolean', default: true, comment: '优先历史中位数' })
  preferHistoricalMedian!: boolean;
}

/** ips:schedule:WorkstationCapacity */
@Entity({ name: 'ips_workstation_capacity' })
@Index(['workstationId', 'effectiveFrom'], { unique: true })
export class WorkstationCapacity extends IpsBaseEntity {
  static readonly code = 'ips:schedule:WorkstationCapacity';

  @Column({ type: 'uuid' })
  workstationId!: string;

  @ManyToOne(() => Workstation)
  @JoinColumn({ name: 'workstationId' })
  workstation!: Workstation;

  @Column({ type: 'date' })
  effectiveFrom!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '日负荷工时' })
  dailyLoadHours!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amHours?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  pmHours?: string | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  pipelineCapacityFactor?: string | null;
}

/** ips:schedule:WorkHourMedian */
@Entity({ name: 'ips_work_hour_median' })
@Index(['productModel', 'repairMethod', 'processOperationId'], { unique: true })
export class WorkHourMedian extends IpsBaseEntity {
  static readonly code = 'ips:schedule:WorkHourMedian';

  @Column({ type: 'varchar', length: 64 })
  productModel!: string;

  @Column({ ...adbEnumColumn(RepairMethodEnum.code) } as any)
  repairMethod!: string;

  @Column({ type: 'uuid' })
  processOperationId!: string;

  @ManyToOne(() => ProcessOperation)
  @JoinColumn({ name: 'processOperationId' })
  processOperation!: ProcessOperation;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '完成时长中位数(小时)' })
  medianHours!: string;

  @Column({ type: 'int', default: 0 })
  sampleCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastCalculatedAt?: Date | null;
}

/** ips:schedule:WorkCardPlanSlot */
@Entity({ name: 'ips_work_card_plan_slot' })
@Index(['workCardId', 'slotDate', 'halfDay'], { unique: true })
export class WorkCardPlanSlot extends IpsBaseEntity {
  static readonly code = 'ips:schedule:WorkCardPlanSlot';

  @Column({ type: 'uuid' })
  workCardId!: string;

  @Column({ type: 'date' })
  slotDate!: string;

  @Column({ ...adbEnumColumn(HalfDayEnum.code) } as any)
  halfDay!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  hours!: string;

  @Column({ type: 'int', default: 0 })
  seq!: number;
}

/** DataSource entities 注册列表 */
export const IPS_ENTITIES = [
  Product,
  Material,
  Workstation,
  RepairResource,
  ProcessOperation,
  ProcessStep,
  ProcessStepEdge,
  ProcessOperationMaterial,
  BopScheme,
  BopOperationNode,
  BopOperationEdge,
  BomScheme,
  BomSchemeNode,
  FactoryOrder,
  WorkshopOrder,
  BomInstance,
  BomInstanceNode,
  BopInstance,
  OperationInstance,
  StepInstance,
  WorkCard,
  WorkCardEdge,
  WorkCardTask,
  SingleUnitPlan,
  WorkCardOutsourcing,
  WorkCardKitRequirement,
  ScheduleConfig,
  WorkstationCapacity,
  WorkHourMedian,
  WorkCardPlanSlot,
] as const;

export const IPS_ENTITY_CODE_MAP: Record<string, (typeof IPS_ENTITIES)[number]> = Object.fromEntries(
  IPS_ENTITIES.map((E) => [(E as { code: string }).code, E]),
);

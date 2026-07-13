{
  "wbsCode": "WBS-XXX-123-L1-001",
  "level": 1,
  "name": "生产令XXX-123：H30型飞机左主起落架大修项目",
  "description": "H30宽体客机左主起落架深度大修，符合CCAR-145部及原厂CMM维修规范，全流程适航可追溯",
  "productionOrderNo": "XXX-123",
  "aircraftType": "H30",
  "component": "主起落架（左侧）",
  "standardBasis": "H30 OEM CMM 32-10-00 主起落架大修手册",
  "responsibleDept": "大修项目组",
  "dataHistory": [
    {
      "operateTime": "2026-06-20 08:12:36",
      "operateType": "创建",
      "sourceType": "MES",
      "sourceInfo": {
        "systemCode": "MES-V2.8",
        "operatorAccount": "prod-admin01",
        "remark": "生产令下达，自动生成顶层WBS根节点"
      }
    },
    {
      "operateTime": "2026-06-20 09:05:11",
      "operateType": "补充数据",
      "sourceType": "CAPP",
      "sourceInfo": {
        "systemCode": "CAPP-PRO-5.1",
        "fileResourceId": "CAPP-H30-3210-0001",
        "fileType": "整机大修工艺总方案",
        "fileName": "H30主起落架全流程维修工艺规程",
        "uploadUser": "工艺部-刘工艺"
      }
    }
  ],
  "children": [
    {
      "wbsCode": "WBS-XXX-123-L2-140",
      "level": 2,
      "name": "故检与缺陷评估阶段",
      "description": "起落架拆解清洗后，全维度故障检测、缺陷量化与维修处置判定，输出报废/委外/自修结论",
      "standardBasis": "CCAR-145.30 维修检验规范、H30 CMM 第3章故障检测要求",
      "responsibleDept": "质量检测中心",
      "phaseMilestone": "故检完成后下达正式维修工单",
      "dataHistory": [
        {
          "operateTime": "2026-06-20 09:10:22",
          "operateType": "创建",
          "sourceType": "MES",
          "sourceInfo": {
            "systemCode": "MES-V2.8",
            "operatorAccount": "prod-admin01",
            "remark": "按大修阶段自动拆分二级WBS节点"
          }
        },
        {
          "operateTime": "2026-06-21 10:22:45",
          "operateType": "修改",
          "sourceType": "工位操作员",
          "sourceInfo": {
            "stationCode": "INS-01 综合检测工位",
            "stationName": "起落架综合故检工位",
            "operatorName": "张工",
            "operatorId": "QC-007",
            "remark": "补充阶段验收节点管控要求"
          }
        }
      ],
      "children": [
        {
          "wbsCode": "WBS-XXX-123-L3-141",
          "level": 3,
          "name": "入厂清点与标识核验",
          "description": "零部件全数量盘点、件号序列号核对、适航履历初核，确认缺件与初始状态",
          "standardBasis": "H30 AMM 32-10-11 起落架接收程序",
          "responsibleDept": "物料检验班",
          "dataHistory": [
            {
              "operateTime": "2026-06-21 08:30:12",
              "operateType": "创建",
              "sourceType": "MES",
              "sourceInfo": {
                "systemCode": "MES-V2.8"
              }
            },
            {
              "operateTime": "2026-06-21 08:45:33",
              "operateType": "补充数据",
              "sourceType": "CAPP",
              "sourceInfo": {
                "systemCode": "CAPP-PRO-5.1",
                "fileResourceId": "CAPP-H30-3210-0102",
                "fileType": "工位操作手册",
                "fileName": "起落架入厂清点标准化作业指导书SOP",
                "uploadUser": "工艺部-王工艺"
              }
            }
          ],
          "children": [
            {
              "wbsCode": "WBS-XXX-123-L4-141.1",
              "level": 4,
              "name": "整机外观与台账核对",
              "description": "起落架整机状态初检、履历本与实物标识一致性核验",
              "responsibleDept": "物料检验班",
              "dataHistory": [
                {
                  "operateTime": "2026-06-21 08:35:10",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-141.1.1",
                  "level": 5,
                  "name": "整机外观目视初检",
                  "description": "检查运输磕碰、外部腐蚀、管路变形等显性缺陷，记录初始状态照片",
                  "standardBasis": "H30 CMM 3.1.1 外观检验规范",
                  "inspectionDevice": "高清工业相机、粗糙度对比样块",
                  "responsibleDept": "物料检验班",
                  "inspector": "张工",
                  "planWorkHours": 2,
                  "actualWorkHours": 1.8,
                  "status": "已完成",
                  "disposalResult": "合格",
                  "disposalRemark": "外表面轻微运输划痕，无结构性损伤",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 09:02:18",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 09:45:22",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "INSP-001",
                        "stationName": "外观检验1号工位",
                        "operatorName": "张工",
                        "operatorId": "QC-007",
                        "remark": "上传现场缺陷实拍照片5张，录入外观检测原始记录"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 09:48:05",
                      "operateType": "修改",
                      "sourceType": "PCS",
                      "sourceInfo": {
                        "systemCode": "PCS-LINE-03",
                        "deviceNo": "CAM-008 工业相机",
                        "remark": "自动同步工位工时采集数据，回填实际工时1.8h"
                      }
                    }
                  ]
                },
                {
                  "wbsCode": "WBS-XXX-123-L5-141.1.2",
                  "level": 5,
                  "name": "件号/序列号与履历核验",
                  "description": "核对支柱、作动筒、锁机构核心件的件号、序列号、限寿起止时间与履历本一致性",
                  "standardBasis": "CCAR-145 部件追溯要求",
                  "inspectionDevice": "零部件追溯系统",
                  "responsibleDept": "质量资料员",
                  "inspector": "李工",
                  "planWorkHours": 3,
                  "actualWorkHours": 3.2,
                  "status": "已完成",
                  "disposalResult": "合格",
                  "disposalRemark": "11件限寿件履历完整，碳刹车盘剩余寿命210循环",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 09:03:10",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 10:10:33",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "DOC-002 资料核验工位",
                        "operatorName": "李工",
                        "operatorId": "DOC-002",
                        "remark": "扫描部件履历本，上传至维修追溯档案库"
                      }
                    }
                  ]
                }
              ]
            },
            {
              "wbsCode": "WBS-XXX-123-L4-141.2",
              "level": 4,
              "name": "拆解后零部件全清点",
              "description": "拆解后按BOM清单逐项盘点，登记缺件、丢失件、外来损伤件",
              "responsibleDept": "物料检验班",
              "dataHistory": [
                {
                  "operateTime": "2026-06-21 08:36:20",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-141.2.1",
                  "level": 5,
                  "name": "结构件与标准件盘点",
                  "description": "销轴、螺栓、衬套、扭力臂等机械结构件数量清点",
                  "standardBasis": "H30 主起落架拆解BOM清单",
                  "inspectionDevice": "电子台秤、数显卡尺",
                  "responsibleDept": "物料检验班",
                  "inspector": "张工",
                  "planWorkHours": 4,
                  "actualWorkHours": 0,
                  "status": "待执行",
                  "disposalResult": "待判定",
                  "disposalRemark": "",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 09:04:02",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 08:50:11",
                      "operateType": "补充数据",
                      "sourceType": "CAPP",
                      "sourceInfo": {
                        "systemCode": "CAPP-PRO-5.1",
                        "fileResourceId": "CAPP-H30-3210-0103",
                        "fileType": "视频操作教程",
                        "fileName": "零部件标准化清点操作教学视频",
                        "uploadUser": "工艺部-刘工艺"
                      }
                    }
                  ]
                },
                {
                  "wbsCode": "WBS-XXX-123-L5-141.2.2",
                  "level": 5,
                  "name": "密封件与耗材清点",
                  "description": "O型圈、防尘封、润滑脂等耗材状态清点，登记需强制更换项",
                  "standardBasis": "H30 CMM 3.1.3 耗材更换准则",
                  "inspectionDevice": "放大镜",
                  "responsibleDept": "物料检验班",
                  "inspector": "张工",
                  "planWorkHours": 2,
                  "actualWorkHours": 0,
                  "status": "待执行",
                  "disposalResult": "待判定",
                  "disposalRemark": "",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 09:04:30",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "wbsCode": "WBS-XXX-123-L3-142",
          "level": 3,
          "name": "外观目视与尺寸精度检测",
          "description": "核心承力件尺寸公差测量、磨损量检测、表面缺陷目视排查，量化磨损与腐蚀程度",
          "standardBasis": "H30 CMM 3.2 尺寸检测公差标准",
          "responsibleDept": "精密检测班",
          "dataHistory": [
            {
              "operateTime": "2026-06-21 11:02:10",
              "operateType": "创建",
              "sourceType": "MES",
              "sourceInfo": {
                "systemCode": "MES-V2.8"
              }
            },
            {
              "operateTime": "2026-06-21 11:10:22",
              "operateType": "补充数据",
              "sourceType": "CAPP",
              "sourceInfo": {
                "systemCode": "CAPP-PRO-5.1",
                "fileResourceId": "CAPP-H30-3210-0201",
                "fileType": "设备操作手册",
                "fileName": "桥式三坐标测量机标准化操作规范",
                "uploadUser": "工艺部-赵工艺"
              }
            }
          ],
          "children": [
            {
              "wbsCode": "WBS-XXX-123-L4-142.1",
              "level": 4,
              "name": "减震支柱组件尺寸检测",
              "description": "外筒、内筒、活塞核心尺寸与磨损量检测",
              "responsibleDept": "精密检测班",
              "dataHistory": [
                {
                  "operateTime": "2026-06-21 11:05:00",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-142.1.1",
                  "level": 5,
                  "name": "外筒内径三坐标测量",
                  "description": "测量外筒内孔圆度、圆柱度、导向段磨损量，对比原厂公差限值",
                  "standardBasis": "H30 CMM 3.2.1 支柱外筒公差表",
                  "inspectionDevice": "桥式三坐标测量机",
                  "responsibleDept": "精密检测班",
                  "inspector": "王工",
                  "planWorkHours": 6,
                  "actualWorkHours": 5.8,
                  "status": "已完成",
                  "disposalResult": "自修",
                  "disposalRemark": "导向段局部磨损0.08mm，超差0.03mm，本厂可镀铬修复",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 11:06:12",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 15:22:40",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "CMM-01 三坐标精密检测工位",
                        "operatorName": "王工",
                        "operatorId": "MEAS-003",
                        "remark": "导入三坐标原始检测报告，上传尺寸曲线图纸"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 15:25:10",
                      "operateType": "修改",
                      "sourceType": "PCS",
                      "sourceInfo": {
                        "systemCode": "PCS-EQUIP-01",
                        "deviceNo": "CMM-001 桥式三坐标机",
                        "remark": "设备自动采集加工/检测工时，回填实际工时5.8h"
                      }
                    }
                  ]
                },
                {
                  "wbsCode": "WBS-XXX-123-L5-142.1.2",
                  "level": 5,
                  "name": "内筒外径与腐蚀深度检测",
                  "description": "测量内筒外径磨损量、表面腐蚀坑深度，判定是否超寿",
                  "standardBasis": "H30 CMM 3.2.2 内筒报废限值",
                  "inspectionDevice": "外径千分尺、针式深度仪",
                  "responsibleDept": "精密检测班",
                  "inspector": "王工",
                  "planWorkHours": 4,
                  "actualWorkHours": 3.7,
                  "status": "已完成",
                  "disposalResult": "报废",
                  "disposalRemark": "下部镀铬层大面积脱落，基体腐蚀坑最大深度0.35mm，超出CMM 0.2mm报废限值，判定整体报废",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 11:06:40",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 16:10:22",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "MEAS-02 腐蚀深度检测工位",
                        "operatorName": "王工",
                        "operatorId": "MEAS-003",
                        "remark": "录入腐蚀深度检测原始数值，提交报废初步判定意见"
                      }
                    }
                  ]
                },
                {
                  "wbsCode": "WBS-XXX-123-L5-142.1.3",
                  "level": 5,
                  "name": "活塞密封沟槽尺寸检测",
                  "description": "检测活塞密封沟槽磨损、划伤程度，判定修复可行性",
                  "standardBasis": "H30 CMM 3.2.3 沟槽公差要求",
                  "inspectionDevice": "轮廓仪、放大镜",
                  "responsibleDept": "精密检测班",
                  "inspector": "王工",
                  "planWorkHours": 3,
                  "actualWorkHours": 2.9,
                  "status": "已完成",
                  "disposalResult": "委外",
                  "disposalRemark": "主密封沟槽存在3处轴向划伤，深度0.12mm，需激光熔覆+超精密研磨修复，本厂无对应工艺设备，指定委外至航宇表面处理公司",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 11:07:05",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-21 16:30:18",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "PROFILE-01 轮廓检测工位",
                        "operatorName": "王工",
                        "operatorId": "MEAS-003",
                        "remark": "上传沟槽轮廓扫描曲线，标注划伤区域，提交委外修复申请"
                      }
                    }
                  ]
                }
              ]
            },
            {
              "wbsCode": "WBS-XXX-123-L4-142.2",
              "level": 4,
              "name": "机轮刹车组件损耗检测",
              "description": "碳刹车盘、轮辋、刹车活塞磨损与损伤检测",
              "responsibleDept": "精密检测班",
              "dataHistory": [
                {
                  "operateTime": "2026-06-21 11:08:00",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-142.2.1",
                  "level": 5,
                  "name": "碳刹车盘厚度与裂纹检测",
                  "description": "测量动静碳盘剩余厚度，目视排查边缘裂纹与分层缺陷",
                  "standardBasis": "H30 CMM 3.2.4 碳盘报废标准",
                  "inspectionDevice": "数显高度尺、工业内窥镜",
                  "responsibleDept": "精密检测班",
                  "inspector": "赵工",
                  "planWorkHours": 2,
                  "actualWorkHours": 1.9,
                  "status": "已完成",
                  "disposalResult": "合格",
                  "disposalRemark": "碳盘剩余厚度24.2mm，高于报废限值22mm，无分层裂纹，可继续使用",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 11:08:30",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    }
                  ]
                },
                {
                  "wbsCode": "WBS-XXX-123-L5-142.2.2",
                  "level": 5,
                  "name": "刹车作动活塞检测",
                  "description": "检测活塞表面划伤、密封圈槽磨损、活塞杆直线度",
                  "standardBasis": "H30 CMM 3.2.5 活塞组件要求",
                  "inspectionDevice": "千分表、直线度仪",
                  "responsibleDept": "精密检测班",
                  "inspector": "赵工",
                  "planWorkHours": 3,
                  "actualWorkHours": 0,
                  "status": "待执行",
                  "disposalResult": "待判定",
                  "disposalRemark": "",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-21 11:09:02",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "wbsCode": "WBS-XXX-123-L3-143",
          "level": 3,
          "name": "NDT无损探伤检测",
          "description": "承力件内部疲劳裂纹、隐蔽腐蚀检测，适航强制必检工序",
          "standardBasis": "HB/Z 72 航空无损检测规范、H30 CMM 3.3 NDT检测要求",
          "responsibleDept": "NDT探伤室",
          "ndtLevelRequirement": "II级及以上探伤人员操作",
          "dataHistory": [
            {
              "operateTime": "2026-06-22 08:20:10",
              "operateType": "创建",
              "sourceType": "MES",
              "sourceInfo": {
                "systemCode": "MES-V2.8"
              }
            },
            {
              "operateTime": "2026-06-22 08:28:33",
              "operateType": "补充数据",
              "sourceType": "CAPP",
              "sourceInfo": {
                "systemCode": "CAPP-PRO-5.1",
                "fileResourceId": "CAPP-H30-3210-0301",
                "fileType": "工艺文件",
                "fileName": "起落架MT/PT/ET无损探伤通用工艺规程",
                "uploadUser": "工艺部-孙工艺"
              }
            }
          ],
          "children": [
            {
              "wbsCode": "WBS-XXX-123-L4-143.1",
              "level": 4,
              "name": "磁粉探伤（MT）",
              "description": "铁磁性承力件表面及近表面疲劳裂纹检测",
              "responsibleDept": "NDT探伤室",
              "dataHistory": [
                {
                  "operateTime": "2026-06-22 08:22:00",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-143.1.1",
                  "level": 5,
                  "name": "主销轴磁粉探伤",
                  "description": "对主连接销轴周向+纵向磁化，检测应力集中区疲劳裂纹",
                  "standardBasis": "HB/Z 72.1 磁粉检测",
                  "inspectionDevice": "荧光磁粉探伤机",
                  "responsibleDept": "NDT探伤室",
                  "inspector": "陈工（NDT II级）",
                  "planWorkHours": 3,
                  "actualWorkHours": 2.8,
                  "status": "已完成",
                  "disposalResult": "合格",
                  "disposalRemark": "无可见磁痕显示，符合Ⅰ级合格要求",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-22 08:23:11",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-22 11:30:44",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "NDT-MT-01 磁粉探伤工位",
                        "operatorName": "陈工",
                        "operatorId": "NDT-001",
                        "remark": "上传荧光磁痕成像照片，生成NDT探伤原始报告"
                      }
                    }
                  ]
                },
                {
                  "wbsCode": "WBS-XXX-123-L5-143.1.2",
                  "level": 5,
                  "name": "扭力臂磁粉探伤",
                  "description": "检测扭力臂耳片、转角应力集中区疲劳裂纹",
                  "standardBasis": "HB/Z 72.1 磁粉检测",
                  "inspectionDevice": "荧光磁粉探伤机",
                  "responsibleDept": "NDT探伤室",
                  "inspector": "陈工（NDT II级）",
                  "planWorkHours": 4,
                  "actualWorkHours": 3.9,
                  "status": "已完成",
                  "disposalResult": "报废",
                  "disposalRemark": "上耳片根部发现长度2.3mm周向疲劳磁痕，超出CMM拒收标准，判定扭力臂整体报废",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-22 08:23:40",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-22 14:05:10",
                      "operateType": "补充数据",
                      "sourceType": "工位操作员",
                      "sourceInfo": {
                        "stationCode": "NDT-MT-01",
                        "operatorName": "陈工",
                        "operatorId": "NDT-001",
                        "remark": "标记裂纹位置尺寸，录入报废判定意见至探伤系统"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "wbsCode": "WBS-XXX-123-L3-144",
          "level": 3,
          "name": "液压与机械功能初测",
          "description": "拆解前功能摸底测试，记录初始渗漏、卡滞、动作异常等故障现象",
          "standardBasis": "H30 CMM 3.4 功能测试规范",
          "responsibleDept": "液压试验班",
          "dataHistory": [
            {
              "operateTime": "2026-06-22 14:30:00",
              "operateType": "创建",
              "sourceType": "MES",
              "sourceInfo": {
                "systemCode": "MES-V2.8"
              }
            }
          ],
          "children": [
            {
              "wbsCode": "WBS-XXX-123-L4-144.1",
              "level": 4,
              "name": "液压系统保压测试",
              "description": "额定压力下保压测试，记录渗漏点与压降速率",
              "responsibleDept": "液压试验班",
              "dataHistory": [
                {
                  "operateTime": "2026-06-22 14:32:00",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-144.1.1",
                  "level": 5,
                  "name": "主液压回路保压测试",
                  "description": "21MPa额定压力保压30分钟，记录压降与渗漏点位",
                  "standardBasis": "H30 CMM 3.4.1 保压验收标准",
                  "inspectionDevice": "液压试验台、高精度压力传感器",
                  "responsibleDept": "液压试验班",
                  "inspector": "孙工",
                  "planWorkHours": 2,
                  "actualWorkHours": 1.9,
                  "status": "已完成",
                  "disposalResult": "自修",
                  "disposalRemark": "30分钟压降0.12MPa，收放作动筒端盖处轻微渗漏，更换密封件即可修复",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-22 14:33:10",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    },
                    {
                      "operateTime": "2026-06-22 16:02:33",
                      "operateType": "补充数据",
                      "sourceType": "PCS",
                      "sourceInfo": {
                        "systemCode": "PCS-HYD-01",
                        "deviceNo": "TEST-BENCH-02 液压综合试验台",
                        "remark": "自动采集30分钟压力曲线，同步上传压降原始数据"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "wbsCode": "WBS-XXX-123-L3-145",
          "level": 3,
          "name": "缺陷评估与处置判定",
          "description": "汇总所有检测结果，出具正式维修处置方案，明确自修、报废、委外范围",
          "standardBasis": "CCAR-145.35 维修放行标准、OEM维修手册限值",
          "responsibleDept": "维修技术室+质量部",
          "dataHistory": [
            {
              "operateTime": "2026-06-23 08:10:00",
              "operateType": "创建",
              "sourceType": "MES",
              "sourceInfo": {
                "systemCode": "MES-V2.8"
              }
            }
          ],
          "children": [
            {
              "wbsCode": "WBS-XXX-123-L4-145.1",
              "level": 4,
              "name": "报废件复核与审批",
              "description": "对判定报废零部件进行技术复核，出具报废单并启动备件采购",
              "responsibleDept": "维修技术室",
              "dataHistory": [
                {
                  "operateTime": "2026-06-23 08:12:00",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-145.1.1",
                  "level": 5,
                  "name": "报废件技术复核",
                  "description": "质量部+技术室联合复核内筒、扭力臂报废结论，签署报废判定单",
                  "standardBasis": "维修中心报废管理程序",
                  "inspectionDevice": "检测报告比对",
                  "responsibleDept": "质量部+技术室",
                  "inspector": "技术主管/质量主管",
                  "planWorkHours": 4,
                  "actualWorkHours": 0,
                  "status": "待执行",
                  "disposalResult": "待审批",
                  "disposalRemark": "待汇总全部检测报告后召开评审会",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-23 08:13:20",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "wbsCode": "WBS-XXX-123-L3-146",
          "level": 3,
          "name": "故检资料归档与工单派发",
          "description": "汇总全部检测报告、判定单据，形成完整故检数据包并启动正式维修",
          "standardBasis": "CCAR-145 维修记录保存要求",
          "responsibleDept": "质量资料室",
          "dataHistory": [
            {
              "operateTime": "2026-06-23 09:00:00",
              "operateType": "创建",
              "sourceType": "MES",
              "sourceInfo": {
                "systemCode": "MES-V2.8"
              }
            }
          ],
          "children": [
            {
              "wbsCode": "WBS-XXX-123-L4-146.2",
              "level": 4,
              "name": "维修工单正式下发",
              "description": "根据处置方案生成自修、委外、采购三类工单，启动大修执行阶段",
              "responsibleDept": "生产调度室",
              "dataHistory": [
                {
                  "operateTime": "2026-06-23 09:02:00",
                  "operateType": "创建",
                  "sourceType": "MES",
                  "sourceInfo": {
                    "systemCode": "MES-V2.8"
                  }
                }
              ],
              "children": [
                {
                  "wbsCode": "WBS-XXX-123-L5-146.2.1",
                  "level": 5,
                  "name": "故检阶段里程碑验收与工单派发",
                  "description": "项目组验收故检成果，正式下达维修执行工单，进入修复装配阶段",
                  "standardBasis": "项目里程碑管理规范",
                  "inspectionDevice": "MES生产系统",
                  "responsibleDept": "生产调度室",
                  "inspector": "调度主管",
                  "planWorkHours": 2,
                  "actualWorkHours": 0,
                  "status": "待执行",
                  "disposalResult": "待启动",
                  "disposalRemark": "本阶段完成标志：故检报告签署、全部处置方案确认",
                  "dataHistory": [
                    {
                      "operateTime": "2026-06-23 09:03:10",
                      "operateType": "创建",
                      "sourceType": "MES",
                      "sourceInfo": {
                        "systemCode": "MES-V2.8"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
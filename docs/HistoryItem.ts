interface HistoryItem {
    // 操作精确时间
    operateTime: string;
    // 操作类型 固定三枚举
    operateType: "创建" | "修改" | "补充数据";
    // 数据来源分类
    sourceType: "MES" | "PCS" | "CAPP" | "工位操作员" | "外协平台" | "NDT系统" | "质量系统";
    // 来源详情，根据sourceType自适应字段
    sourceInfo: {
      // 通用字段
      systemCode?: string; // 系统版本编号
      operatorAccount?: string; // 系统账号
      remark?: string;
      // CAPP专属字段
      fileResourceId?: string; // 企业全局唯一工艺文件ID
      fileType?: "工艺文件" | "设备操作手册" | "视频操作教程";
      fileName?: string;
      uploadUser?: string;
      // PCS设备采集专属
      deviceNo?: string; // 设备编号
      // 工位操作员专属
      stationCode?: string; // 工位编码
      stationName?: string; // 工位名称
      operatorName?: string; // 操作员姓名
      operatorId?: string; // 操作员工号
    }
  }

  /**
   * 3. sourceType 业务释义
MES：生产执行系统，WBS 创建、工单下发、流程状态变更；
PCS：产线设备管理系统，设备自动采集工时、压力、尺寸、探伤原始数据；
CAPP：工艺设计系统，提供工艺规程、设备 SOP、操作教学视频，携带唯一fileResourceId；
工位操作员：人工在工位终端录入检测记录、缺陷照片、判定意见；
扩展类型：外协平台、NDT 专用探伤系统、质量检验系统。
4. 原有 L5 核心业务字段保留
检测设备、计划 / 实际工时、检验员、适航标准依据
status：待执行 / 检测中 / 已完成 / 待审批 / 待启动
disposalResult：合格 / 自修 / 报废 / 委外 / 待判定
disposalRemark：报废、委外详细原因与指定供方说明
   * 
   * **/
import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import LoginPage from './auth/LoginPage';
import AuthCallback from './auth/AuthCallback';
import NotifyAppLogin from './auth/NotifyAppLogin';
import AuthGate from './auth/AuthGate';
import AppLayout from './layouts/AppLayout';

// 懒加载页面
const Dashboard = lazy(() => import('./pages/Dashboard'));
const HelpPage = lazy(() => import('./pages/Help'));
const OrderLaunchList = lazy(() => import('./pages/OrderLaunch/List'));
const OrderLaunchWizard = lazy(() => import('./pages/OrderLaunch/Launch'));
const OrderDetail = lazy(() => import('./pages/OrderLaunch/Detail'));
const WorkCardsList = lazy(() => import('./pages/WorkCards/List'));
const WorkCardDetail = lazy(() => import('./pages/WorkCards/Detail'));
const FloatingPool = lazy(() => import('./pages/FloatingPool'));
const WbsPage = lazy(() => import('./pages/Wbs'));
const PipelinePage = lazy(() => import('./pages/Pipeline'));
const KitPage = lazy(() => import('./pages/Kit'));
const NonRoutineList = lazy(() => import('./pages/NonRoutine/List'));
const NonRoutineCreate = lazy(() => import('./pages/NonRoutine/Create'));
const EngineConfigPage = lazy(() => import('./pages/EngineConfig'));
const EngineMonitorPage = lazy(() => import('./pages/EngineMonitor'));
const GanttPage = lazy(() => import('./pages/Gantt'));
const LoadVizPage = lazy(() => import('./pages/LoadViz'));
const AnalyticsReportPage = lazy(() => import('./pages/AnalyticsReport'));
const AreaTypeConfigPage = lazy(() => import('./pages/AreaTypeConfig'));
const WorkstationConfigPage = lazy(() => import('./pages/WorkstationConfig'));
const BomSchemeListPage = lazy(() => import('./pages/Craft/Bom/List'));
const BomSchemeEditPage = lazy(() => import('./pages/Craft/Bom/Edit'));
const ProcessOperationListPage = lazy(() => import('./pages/Craft/Operations/List'));
const ProcessOperationDetailPage = lazy(() => import('./pages/Craft/Operations/Detail'));
const ProcessStepFormPage = lazy(() => import('./pages/Craft/Operations/StepForm'));
const BopSchemeListPage = lazy(() => import('./pages/Craft/Bop/List'));
const BopSchemeEditPage = lazy(() => import('./pages/Craft/Bop/Edit'));
const TroubleshootBopPage = lazy(() => import('./pages/Craft/Bop/Troubleshoot'));
const CraftVersionsPage = lazy(() => import('./pages/Craft/Versions'));
const MeasurementEquipmentPage = lazy(() => import('./pages/MeasurementEquipment'));
const SortingGuideListPage = lazy(() => import('./advanced-line/sorting-guide/List'));
const SortingGuideEditPage = lazy(() => import('./advanced-line/sorting-guide/Edit'));
const CallTypesPage = lazy(() => import('./advanced-line/call/CallTypes'));
const CallLogsPage = lazy(() => import('./advanced-line/call/CallLogs'));
const InspectionRecordsPage = lazy(() => import('./pages/InspectionRecords'));

function PageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Spin size="large" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* 公开路由 */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/notify-app" element={<NotifyAppLogin />} />

      {/* 受保护业务路由（统一 AppLayout） */}
      <Route
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<PageLoading />}><Dashboard /></Suspense>} />
        <Route path="/help" element={<Suspense fallback={<PageLoading />}><HelpPage /></Suspense>} />

        {/* 计划排产 */}
        <Route path="/plan" element={<Navigate to="/plan/orders" replace />} />
        <Route path="/plan/orders" element={<Suspense fallback={<PageLoading />}><OrderLaunchList /></Suspense>} />
        <Route path="/plan/orders/launch" element={<Suspense fallback={<PageLoading />}><OrderLaunchWizard /></Suspense>} />
        <Route path="/plan/orders/:id" element={<Suspense fallback={<PageLoading />}><OrderDetail /></Suspense>} />
        <Route path="/plan/wbs" element={<Suspense fallback={<PageLoading />}><WbsPage /></Suspense>} />
        <Route path="/plan/floating" element={<Suspense fallback={<PageLoading />}><FloatingPool /></Suspense>} />

        {/* 工位调度 */}
        <Route path="/dispatch" element={<Navigate to="/dispatch/workcards" replace />} />
        <Route path="/dispatch/workcards" element={<Suspense fallback={<PageLoading />}><WorkCardsList /></Suspense>} />
        <Route path="/dispatch/workcards/:id" element={<Suspense fallback={<PageLoading />}><WorkCardDetail /></Suspense>} />
        <Route path="/dispatch/inspection-records" element={<Suspense fallback={<PageLoading />}><InspectionRecordsPage /></Suspense>} />
        <Route path="/dispatch/pipeline" element={<Suspense fallback={<PageLoading />}><PipelinePage /></Suspense>} />
        <Route path="/dispatch/kit" element={<Suspense fallback={<PageLoading />}><KitPage /></Suspense>} />
        <Route path="/dispatch/non-routine" element={<Suspense fallback={<PageLoading />}><NonRoutineList /></Suspense>} />
        <Route path="/dispatch/non-routine/create" element={<Suspense fallback={<PageLoading />}><NonRoutineCreate /></Suspense>} />

        {/* 排产引擎 */}
        <Route path="/engine" element={<Navigate to="/engine/monitor" replace />} />
        <Route path="/engine/monitor" element={<Suspense fallback={<PageLoading />}><EngineMonitorPage /></Suspense>} />
        <Route path="/engine/config" element={<Suspense fallback={<PageLoading />}><EngineConfigPage /></Suspense>} />

        {/* 排产可视化 */}
        <Route path="/viz" element={<Navigate to="/viz/gantt" replace />} />
        <Route path="/viz/gantt" element={<Suspense fallback={<PageLoading />}><GanttPage /></Suspense>} />
        <Route path="/viz/load" element={<Suspense fallback={<PageLoading />}><LoadVizPage /></Suspense>} />

        {/* 统计分析 */}
        <Route path="/analytics" element={<Navigate to="/analytics/report" replace />} />
        <Route path="/analytics/report" element={<Suspense fallback={<PageLoading />}><AnalyticsReportPage /></Suspense>} />

        {/* 工艺管理 */}
        <Route path="/craft" element={<Navigate to="/craft/bom" replace />} />
        <Route path="/craft/bom" element={<Suspense fallback={<PageLoading />}><BomSchemeListPage /></Suspense>} />
        <Route path="/craft/bom/:id/edit" element={<Suspense fallback={<PageLoading />}><BomSchemeEditPage /></Suspense>} />
        <Route path="/craft/operations" element={<Suspense fallback={<PageLoading />}><ProcessOperationListPage /></Suspense>} />
        <Route path="/craft/operations/:operationId/steps/new" element={<Suspense fallback={<PageLoading />}><ProcessStepFormPage /></Suspense>} />
        <Route path="/craft/operations/:operationId/steps/:stepId" element={<Suspense fallback={<PageLoading />}><ProcessStepFormPage /></Suspense>} />
        <Route path="/craft/operations/:id" element={<Suspense fallback={<PageLoading />}><ProcessOperationDetailPage /></Suspense>} />
        <Route path="/craft/bop" element={<Suspense fallback={<PageLoading />}><BopSchemeListPage /></Suspense>} />
        <Route path="/craft/bop/:id/edit" element={<Suspense fallback={<PageLoading />}><BopSchemeEditPage /></Suspense>} />
        <Route path="/craft/troubleshoot" element={<Suspense fallback={<PageLoading />}><TroubleshootBopPage /></Suspense>} />
        <Route path="/craft/versions" element={<Suspense fallback={<PageLoading />}><CraftVersionsPage /></Suspense>} />

        {/* 高级产线业务 */}
        <Route path="/line" element={<Navigate to="/line/sorting-guide" replace />} />
        <Route path="/line/sorting-guide" element={<Suspense fallback={<PageLoading />}><SortingGuideListPage /></Suspense>} />
        <Route path="/line/sorting-guide/:id" element={<Suspense fallback={<PageLoading />}><SortingGuideEditPage /></Suspense>} />
        <Route path="/line/call-types" element={<Suspense fallback={<PageLoading />}><CallTypesPage /></Suspense>} />
        <Route path="/line/call-logs" element={<Suspense fallback={<PageLoading />}><CallLogsPage /></Suspense>} />

        {/* 基础配置 */}
        <Route path="/master" element={<Navigate to="/master/workstations" replace />} />
        <Route path="/master/area-types" element={<Suspense fallback={<PageLoading />}><AreaTypeConfigPage /></Suspense>} />
        <Route path="/master/workstations" element={<Suspense fallback={<PageLoading />}><WorkstationConfigPage /></Suspense>} />
        <Route path="/master/measurement-equipment" element={<Suspense fallback={<PageLoading />}><MeasurementEquipmentPage /></Suspense>} />
      </Route>

      {/* 根路径 → 工作台 */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

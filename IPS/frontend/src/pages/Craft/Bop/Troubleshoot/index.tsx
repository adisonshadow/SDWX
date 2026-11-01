import BopSchemeEditPage from '../Edit';

/** 排故临时搭路线：预填修理方式=排故，复用 BOP 编辑 */
export default function TroubleshootBopPage() {
  return <BopSchemeEditPage isTroubleshoot />;
}

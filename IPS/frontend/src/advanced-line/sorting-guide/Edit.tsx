/**
 * 分拣示意图编辑：绑定维修方案和物料分类，按数量生成槽位，在图上拖出热区。
 */
import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, Segmented, Select, Space, Upload } from 'antd';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listBopSchemes } from '@/services/master';
import { getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';
import { message } from '@/utils/antdAppApis';
import {
  getSortingGuide,
  guideOptions,
  guidePhotoUrl,
  saveSortingGuide,
  uploadGuidePhoto,
  type ClassOption,
  type GuideSlot,
  type HotZone,
  type HotZoneShape,
} from './api';

interface SchemeOption {
  id: string;
  label: string;
}

const WHOLE_CLASS = '__whole__';

function zoneStyle(zone: HotZone, active: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`,
    border: `2px solid ${active ? 'var(--ant-color-primary)' : 'var(--ant-color-warning)'}`,
    background: active ? 'color-mix(in srgb, var(--ant-color-primary) 25%, transparent)' : 'color-mix(in srgb, var(--ant-color-warning) 18%, transparent)',
    borderRadius: zone.shape === 'circle' ? '50%' : 0,
    boxSizing: 'border-box',
  };
}

/** 矩形按拖动的宽高。正方形和圆在画面上边长相等。坐标相对图片显示尺寸。 */
function drawZone(
  start: { x: number; y: number },
  point: { x: number; y: number },
  width: number,
  height: number,
  shape: HotZoneShape,
): HotZone {
  const dx = (point.x - start.x) * width;
  const dy = (point.y - start.y) * height;
  const signX = dx < 0 ? -1 : 1;
  const signY = dy < 0 ? -1 : 1;
  const boxW = shape === 'rect' ? Math.min(Math.abs(dx), width) : Math.min(Math.max(Math.abs(dx), Math.abs(dy)), width, height);
  const boxH = shape === 'rect' ? Math.min(Math.abs(dy), height) : boxW;
  let left = start.x * width + (signX < 0 ? -boxW : 0);
  let top = start.y * height + (signY < 0 ? -boxH : 0);
  left = Math.min(Math.max(0, left), Math.max(0, width - boxW));
  top = Math.min(Math.max(0, top), Math.max(0, height - boxH));
  return {
    shape,
    x: width ? left / width : 0,
    y: height ? top / height : 0,
    w: width ? boxW / width : 0,
    h: height ? boxH / height : 0,
  };
}

export default function SortingGuideEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [schemes, setSchemes] = useState<SchemeOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [slots, setSlots] = useState<GuideSlot[]>([]);
  const [selected, setSelected] = useState(0);
  const [photoUrl, setPhotoUrl] = useState('');
  const [shape, setShape] = useState<HotZoneShape>('square');
  const [draft, setDraft] = useState<HotZone | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<HotZone | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listBopSchemes({ versionStatus: 'PUBLISHED' }).then((res) => {
      if (!isApiSuccess(res)) return;
      const items = (res.data?.items ?? []) as Array<Record<string, string>>;
      setSchemes(items.map((item) => ({
        id: item.id,
        label: `${item.productModel ?? ''} ${item.name ?? item.bizNo ?? ''}`.trim(),
      })));
    }).catch((e: Error) => message.error(e.message));
  }, []);

  useEffect(() => {
    if (isNew) return;
    getSortingGuide(id!).then(async (res) => {
      const template = res.data.template;
      form.setFieldsValue({
        templateCode: template.templateCode,
        templateName: template.templateName,
        bopSchemeId: template.bopSchemeId,
        materialClassId: template.materialClassId || WHOLE_CLASS,
        photoObjectId: template.photoObjectId,
      });
      setSlots(res.data.slots ?? []);
      if (template.bopSchemeId) await loadClasses(template.bopSchemeId);
      if (template.photoObjectId) {
        const url = await guidePhotoUrl(template.photoObjectId);
        setPhotoUrl(url);
      }
    }).catch((e: Error) => message.error(e.message));
  }, [id, isNew, form]);

  const loadClasses = async (bopSchemeId: string) => {
    const res = await guideOptions(bopSchemeId);
    const next = (res.data.classes ?? []).map((item) => ({ ...item, id: item.id || WHOLE_CLASS }));
    setClasses(next);
    if (next.length === 1 && !form.getFieldValue('materialClassId')) {
      form.setFieldValue('materialClassId', next[0].id);
    }
  };

  const currentClass = classes.find((item) => item.id === (form.getFieldValue('materialClassId') ?? ''));
  const classItems = currentClass?.items ?? [];

  const generateSlots = () => {
    const classId = form.getFieldValue('materialClassId') ?? '';
    const picked = classes.find((item) => item.id === classId);
    if (!picked) {
      message.warning('请先选择物料分类');
      return;
    }
    const next: GuideSlot[] = [];
    picked.items.forEach((item) => {
      for (let n = 1; n <= item.quantity; n += 1) {
        const kept = slots.find((slot) => slot.materialId === item.materialId && slot.instanceNo === n);
        next.push({
          id: kept?.id,
          materialId: item.materialId,
          materialNo: item.materialNo,
          materialName: item.name,
          partCode: item.materialNo,
          instanceNo: n,
          slotCode: `${item.materialNo}-${n}`,
          hotZone: kept?.hotZone ?? null,
          required: true,
          sortOrder: next.length + 1,
          slotStatus: kept?.slotStatus || 'empty',
        });
      }
    });
    setSlots(next);
    setSelected(0);
  };

  const pointOf = (event: MouseEvent) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      width: rect.width,
      height: rect.height,
    };
  };

  const paint = (event: MouseEvent) => {
    const point = pointOf(event);
    const start = drag.current;
    if (!point || !start) return;
    const next = drawZone(start, point, point.width, point.height, shape);
    draftRef.current = next;
    setDraft(next);
  };

  const onMouseDown = (event: MouseEvent) => {
    const point = pointOf(event);
    if (!point || !slots.length) return;
    drag.current = point;
    paint(event);
  };

  const onMouseUp = () => {
    const zone = draftRef.current;
    drag.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!zone || zone.w < 0.01 || zone.h < 0.01) return;
    setSlots((prev) => prev.map((slot, index) => (index === selected ? { ...slot, hotZone: zone } : slot)));
  };

  const payload = (status: 'draft' | 'published') => {
    const values = form.getFieldsValue();
    return {
      templateCode: values.templateCode,
      templateName: values.templateName,
      bopSchemeId: values.bopSchemeId,
      materialClassId: values.materialClassId === WHOLE_CLASS ? null : values.materialClassId,
      photoObjectId: values.photoObjectId,
      workstationType: 'sorting',
      status,
      slots,
    };
  };

  const save = async (status: 'draft' | 'published') => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    try {
      const res = await saveSortingGuide(isNew ? undefined : id, payload(status));
      message.success(status === 'published' ? '已发布' : '已保存');
      const nextId = res.data.id;
      if (nextId && nextId !== id) navigate(`/line/sorting-guide/${nextId}`, { replace: true });
      else if (isNew && nextId) navigate(`/line/sorting-guide/${nextId}`, { replace: true });
    } catch (e) {
      message.error(getApiErrorMessage(e, (e as Error).message));
    }
  };

  const beforeUpload = async (file: File) => {
    try {
      const objectId = await uploadGuidePhoto(file);
      form.setFieldValue('photoObjectId', objectId);
      const url = await guidePhotoUrl(objectId);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e) {
      message.error((e as Error).message);
    }
    return false;
  };

  const selectedSlot = slots[selected];
  const hint = useMemo(() => (
    selectedSlot
      ? `${selectedSlot.materialName || selectedSlot.materialNo || '物料'} 第 ${selectedSlot.instanceNo ?? selected + 1} 件`
      : '先生成槽位，再在图上为当前槽拖出热区'
  ), [selectedSlot, selected]);

  return (
    <PageContainer
      onBack={() => navigate('/line/sorting-guide')}
      extra={(
        <Space>
          <Segmented
            value={shape}
            onChange={(value) => setShape(value as HotZoneShape)}
            options={[
              { label: '矩形', value: 'rect' },
              { label: '正方形', value: 'square' },
              { label: '圆形', value: 'circle' },
            ]}
          />
          <Button onClick={() => save('draft')}>保存草稿</Button>
          <Button type="primary" onClick={() => save('published')}>发布</Button>
        </Space>
      )}
    >
      <Form form={form} layout="vertical" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        <div>
          <Form.Item name="templateCode" label="模版编码" rules={[{ required: true, message: '请填写编码' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="templateName" label="名称" rules={[{ required: true, message: '请填写名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bopSchemeId" label="维修方案" rules={[{ required: true, message: '请选择维修方案' }]}>
            <Select
              options={schemes.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(value) => {
                form.setFieldValue('materialClassId', undefined);
                setClasses([]);
                void loadClasses(value);
              }}
            />
          </Form.Item>
          <Form.Item name="materialClassId" label="物料分类">
            <Select
              options={classes.map((item) => ({ value: item.id, label: item.name }))}
              onChange={() => setSlots([])}
            />
          </Form.Item>
          <Form.Item name="photoObjectId" hidden><Input /></Form.Item>
          <Space style={{ marginBottom: 16 }}>
            <Upload accept="image/*" showUploadList={false} beforeUpload={beforeUpload}>
              <Button>上传示意图</Button>
            </Upload>
            <Button onClick={generateSlots}>按数量生成槽位</Button>
          </Space>
          <div style={{ color: 'var(--ant-color-text-secondary)', marginBottom: 8 }}>{hint}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {classItems.length > 0 && slots.length === 0 && (
              <span style={{ color: 'var(--ant-color-text-secondary)' }}>该分类下有 {classItems.length} 种物料</span>
            )}
            {slots.map((slot, index) => (
              <button
                key={`${slot.materialId}-${slot.instanceNo}`}
                type="button"
                onClick={() => setSelected(index)}
                style={{
                  textAlign: 'left',
                  padding: 8,
                  borderRadius: 6,
                  border: index === selected ? '1px solid var(--ant-color-primary)' : '1px solid var(--ant-color-border)',
                  background: index === selected ? 'var(--ant-color-primary-bg)' : 'transparent',
                }}
              >
                {slot.materialName || slot.materialNo} 第 {slot.instanceNo} 件
                <span style={{ marginLeft: 8, color: slot.hotZone ? 'var(--ant-color-success)' : 'var(--ant-color-error)' }}>
                  {slot.hotZone ? '已标注' : '未标注'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div
          ref={frameRef}
          onMouseDown={onMouseDown}
          onMouseMove={paint}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ position: 'relative', alignSelf: 'start', width: '100%', lineHeight: 0, userSelect: 'none' }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="分拣示意图" draggable={false} style={{ width: '100%', height: 'auto', display: 'block' }} />
          ) : (
            <div style={{ height: 360, lineHeight: '22px', display: 'grid', placeItems: 'center', background: 'var(--ant-color-fill-quaternary)' }}>
              请上传行迹盘俯视图
            </div>
          )}
          {slots.map((slot, index) => slot.hotZone && (
            <div key={`${slot.slotCode}-${index}`} style={zoneStyle(slot.hotZone, index === selected)} />
          ))}
          {draft && <div style={zoneStyle(draft, true)} />}
        </div>
      </Form>
    </PageContainer>
  );
}

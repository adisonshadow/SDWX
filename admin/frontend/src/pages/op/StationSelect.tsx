/**
 * StationSelect — 工位选择（两步：类型 → 具体工位）
 */
import { useEffect, useState } from 'react';
import { Spin, Empty } from 'antd';
import { useOPHeader } from '../../layout/OPHeaderContext';
import { fetchWorkstations } from '../../api/opApi';
import {
  WORKSTATION_TYPES,
  WORKSTATION_TYPE_LABELS,
  type WorkstationType,
  type Workstation,
} from '@fmms/shared';

export default function StationSelect({
  onSelected,
}: {
  onSelected: (code: string, type: WorkstationType, name: string) => void;
}) {
  const [selectedType, setSelectedType] = useState<WorkstationType | null>(null);
  const [stations, setStations] = useState<Workstation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedType) return;
    setLoading(true);
    fetchWorkstations(selectedType)
      .then((res) => setStations(res.items))
      .catch(() => setStations([]))
      .finally(() => setLoading(false));
  }, [selectedType]);

  useOPHeader({
    title: selectedType ? WORKSTATION_TYPE_LABELS[selectedType] : '选择工位类型',
    onBack: selectedType ? () => setSelectedType(null) : undefined,
  });

  if (!selectedType) {
    return (
      <div className="op-body">
          <div className="op-card-grid-3">
            {WORKSTATION_TYPES.map((type) => (
              <div
                key={type}
                className="op-part-card"
                style={{ textAlign: 'center', minHeight: 120, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                onClick={() => setSelectedType(type)}
              >
                <div className="op-part-name">{WORKSTATION_TYPE_LABELS[type]}</div>
              </div>
            ))}
          </div>
        </div>
    );
  }

  return (
    <div className="op-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : stations.length === 0 ? (
          <Empty description="该类型暂无已配置工位" />
        ) : (
          <div className="op-card-grid-2">
            {stations.map((ws) => (
              <div
                key={ws.id ?? ws.station_code}
                className="op-part-card"
                onClick={() => onSelected(ws.station_code, ws.station_type, ws.station_name)}
              >
                <div className="op-part-name">{ws.station_name}</div>
                <span className="op-part-badge pending">{ws.station_code}</span>
                {ws.location && (
                  <div className="op-meta-row" style={{ marginTop: 8, color: 'var(--op-text-secondary)' }}>
                    位置：{ws.location}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

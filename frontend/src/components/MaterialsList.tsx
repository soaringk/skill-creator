import type { MaterialSummary } from "../types";
import { Details } from "./Details";

export function MaterialsList({ materials, slug }: { materials: MaterialSummary[]; slug: string }) {
  return (
    <div className="card">
      <div className="area-header">2. 审核与完善</div>
      <h2 className="card-title">素材 ({materials.length})</h2>
      <div>
        {materials.length === 0 ? (
          <div className="text-muted text-sm text-center">暂无素材。</div>
        ) : (
          materials.map(material => (
            <MaterialItem key={`${slug}:${material.id}`} material={material} />
          ))
        )}
      </div>
    </div>
  );
}

function MaterialItem({ material }: { material: MaterialSummary }) {
  const firstLine = material.content
    ?.split(/\r?\n/)
    .find(line => line.trim().length > 0)
    ?.replace(/^#+\s*/, "")
    .trim();
  const title = firstLine || material.type;
  const displayTitle = title.length > 40 ? `${title.substring(0, 40)}...` : title;

  return (
    <div className="material-item">
      <Details>
        <summary className="material-preview-summary">
          <div className="m-type" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={title}>
            {displayTitle}
          </div>
          <div className="m-id">{material.id.substring(0, 8)}</div>
        </summary>
        {material.content ? (
          <pre className="code-block" style={{ marginTop: 10 }}>{material.content}</pre>
        ) : (
          <div className="text-muted text-sm mt-2 text-center">暂无内容。</div>
        )}
      </Details>
    </div>
  );
}

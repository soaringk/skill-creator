import { parseDraftSections } from "../draft";
import type { SkillDetail } from "../types";
import { Details } from "./Details";

export function SkillStatus({ detail }: { detail: SkillDetail }) {
  const draft = parseDraftSections(detail.draft);

  return (
    <div className="card mt-3">
      <h2 className="card-title">Skill 状态</h2>
      {draft.publishable || draft.review ? (
        <>
          <Details initialOpen>
            <summary>可发布内容</summary>
            <pre className="draft-block">{draft.publishable || "暂无可发布内容。"}</pre>
          </Details>
          {draft.review ? (
            <Details className="mt-2">
              <summary>评审意见</summary>
              <pre className="draft-block">{draft.review}</pre>
            </Details>
          ) : null}
        </>
      ) : (
        <Details initialOpen>
          <summary>草稿</summary>
          <pre className="draft-block">{draft.raw || "暂无草稿。"}</pre>
        </Details>
      )}
      {detail.promoted ? (
        <Details className="mt-2">
          <summary>已发布版本</summary>
          <pre className="draft-block">{detail.promoted}</pre>
        </Details>
      ) : null}
    </div>
  );
}

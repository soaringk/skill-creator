import type { SkillSummary } from "../types";

type SidebarProps = {
  collapsed: boolean;
  mobileVisible: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (slug: string) => void;
  selectedSlug: string | null;
  skills: SkillSummary[];
};

export function Sidebar({
  collapsed,
  mobileVisible,
  onClose,
  onCreate,
  onSelect,
  selectedSlug,
  skills,
}: SidebarProps) {
  return (
    <div className={`sidebar ${mobileVisible ? "" : "hidden-on-mobile"} ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <h2>Skill 创作列表</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="nav-btn" id="open-create-btn" style={{ fontSize: 24 }} onClick={onCreate}>
            +
          </button>
          <button
            className="nav-btn desktop-only"
            id="close-sidebar-btn"
            style={{ fontSize: 20, padding: "0 4px" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      <div className="skill-list">
        {skills.length === 0 ? (
          <div className="text-muted text-center mt-3">暂无 Skill</div>
        ) : (
          skills.map(skill => (
            <SkillCard
              key={skill.slug}
              active={skill.slug === selectedSlug}
              skill={skill}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SkillCard({
  active,
  onSelect,
  skill,
}: {
  active: boolean;
  onSelect: (slug: string) => void;
  skill: SkillSummary;
}) {
  const statusClass = skill.status.toLowerCase();
  return (
    <div className={`skill-card${active ? " active" : ""}`} onClick={() => onSelect(skill.slug)}>
      <div className="skill-card-title">{skill.title}</div>
      <div className="skill-card-meta">
        <span className={`badge ${statusClass}`}>{skill.status}</span>
        <span>{skill.slug}</span>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import FindingDrawer, {
  type Finding,
  type FindingDraft,
} from "./FindingDrawer";
import { OPPORTUNITIES, type Opportunity } from "./opportunities";

type View =
  | "briefing"
  | "home"
  | "workspace"
  | "explore"
  | "activity"
  | "profile";

const STORAGE_KEY = "nexus.findings.v1";
const VIEW_STORAGE_KEY = "nexus.view.v1";
const STUDENT_STORAGE_KEY = "nexus.student.v1";
const MISSION_COMPLETE_STORAGE_KEY = "nexus.missionCompleted.v1";
const REPORT_DETAILS_STORAGE_KEY = "nexus.reportDetails.v1";

// Report Details are the intern's real identity for exported assessment
// evidence. Deliberately separate from the dummy NEXUS profile — different
// storage key, never touches the profile data.
type ReportDetails = {
  name: string;
  email: string;
};

const DEFAULT_REPORT_DETAILS: ReportDetails = {
  name: "",
  email: "",
};

type ReportDetailsErrors = {
  name?: string;
  email?: string;
};

type PendingExport = "json" | "pdf" | null;

// Private mission information, revealed only after Mission 001 is marked
// complete. UK01 is intentionally left out — it must stay undisclosed.
type RevealItem = {
  id: string;
  label: string;
  description: string;
};

const PLANTED_ISSUES: RevealItem[] = [
  {
    id: "P01",
    label: "Search",
    description:
      "Searching \u201cPython\u201d fails to return one opportunity that has Python listed as a skill.",
  },
  {
    id: "P02",
    label: "Filter",
    description:
      "Selecting a category filter leaves one opportunity visible that belongs to a different category.",
  },
  {
    id: "P03",
    label: "Join State",
    description:
      "Joining an opportunity shows \u201cJoined,\u201d but returning to its detail page still shows \u201cJoin opportunity.\u201d",
  },
  {
    id: "P04",
    label: "Persistence",
    description:
      "A joined opportunity disappears from My Activity after refreshing the page.",
  },
  {
    id: "P05",
    label: "Data Consistency",
    description:
      "An opportunity shows different duration information on its card and detail page.",
  },
  {
    id: "P06",
    label: "Navigation",
    description:
      "Opening an opportunity from filtered results and going back loses the selected filter/search state.",
  },
  {
    id: "P07",
    label: "Search/Filter State",
    description:
      "Applying a category filter, then entering and clearing a search term, unexpectedly resets the selected category filter.",
  },
  {
    id: "P08",
    label: "Duplicate Action",
    description:
      "Clicking \u201cJoin opportunity\u201d repeatedly can create duplicate entries in My Activity.",
  },
  {
    id: "P09",
    label: "Profile Persistence",
    description:
      "Editing a profile field appears successful but the change is lost after a full browser refresh.",
  },
  {
    id: "P10",
    label: "Responsive UX",
    description:
      "At approximately 390px viewport width, an important Explore filter control becomes partially clipped/inaccessible.",
  },
];

const FALSE_POSITIVES: RevealItem[] = [
  {
    id: "FP01",
    label: "False Positive",
    description:
      "An apparently inconsistent duration is actually correct because the detail view breaks the total duration into components (e.g. 5 weeks total = 3 weeks design + 2 weeks installation).",
  },
];

function isReportDetails(value: unknown): value is ReportDetails {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" && typeof record.email === "string"
  );
}

function loadReportDetails(): ReportDetails {
  try {
    const raw = localStorage.getItem(REPORT_DETAILS_STORAGE_KEY);
    if (!raw) return DEFAULT_REPORT_DETAILS;

    const parsed = JSON.parse(raw);
    return isReportDetails(parsed) ? parsed : DEFAULT_REPORT_DETAILS;
  } catch {
    return DEFAULT_REPORT_DETAILS;
  }
}

function loadMissionCompleted(): boolean {
  try {
    return localStorage.getItem(MISSION_COMPLETE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isReportDetailsComplete(details: ReportDetails): boolean {
  return Boolean(details.name.trim()) && EMAIL_PATTERN.test(details.email.trim());
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "student";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Any view that counts as "inside the mission" for the purposes of the
// persistent finding controls in the top nav and the "IN PROGRESS" pill.
// Browsing between these views is never treated as leaving the mission.
function isMissionView(view: View): boolean {
  return (
    view === "workspace" ||
    view === "explore" ||
    view === "activity" ||
    view === "profile"
  );
}

type StudentProfile = {
  name: string;
  interests: string;
  skills: string;
  bio: string;
};

type StudentState = {
  joinedIds: string[];
  profile: StudentProfile;
};

const DEFAULT_PROFILE: StudentProfile = {
  name: "Alex Rivera",
  interests: "Community projects, product design, youth mentorship",
  skills: "UX research, Figma, basic Python",
  bio: "Second-year CS student who likes turning messy problems into small, usable tools.",
};

const DEFAULT_STUDENT_STATE: StudentState = {
  joinedIds: [],
  profile: DEFAULT_PROFILE,
};

function isStudentProfile(value: unknown): value is StudentProfile {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.name === "string" &&
    typeof record.interests === "string" &&
    typeof record.skills === "string" &&
    typeof record.bio === "string"
  );
}

function isStudentState(value: unknown): value is StudentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    Array.isArray(record.joinedIds) &&
    record.joinedIds.every((id) => typeof id === "string") &&
    isStudentProfile(record.profile)
  );
}

function loadStudentState(): StudentState {
  try {
    const raw = localStorage.getItem(STUDENT_STORAGE_KEY);
    if (!raw) return DEFAULT_STUDENT_STATE;

    const parsed = JSON.parse(raw);
    return isStudentState(parsed) ? parsed : DEFAULT_STUDENT_STATE;
  } catch {
    // Missing, corrupted, or unavailable localStorage data should never
    // crash the app — just start from the default student state.
    return DEFAULT_STUDENT_STATE;
  }
}

function isView(value: unknown): value is View {
  return (
    value === "briefing" ||
    value === "home" ||
    value === "workspace" ||
    value === "explore" ||
    value === "activity" ||
    value === "profile"
  );
}

function loadView(): View {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return isView(raw) ? raw : "briefing";
  } catch {
    return "briefing";
  }
}

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.title === "string" &&
    typeof record.area === "string" &&
    typeof record.expected === "string" &&
    typeof record.actual === "string" &&
    typeof record.impact === "string" &&
    typeof record.severity === "string" &&
    typeof record.priority === "string"
  );
}

function loadFindings(): Finding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isFinding);
  } catch {
    // Missing, corrupted, or unavailable localStorage data should never
    // crash the app — just start with no findings.
    return [];
  }
}

function App() {
  const [view, setView] = useState<View>(() => loadView());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [findings, setFindings] = useState<Finding[]>(() => loadFindings());
  const [editingFinding, setEditingFinding] = useState<Finding | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Student-facing product state: opportunities joined and profile details,
  // namespaced separately from findings storage so they never collide.
  const [studentState, setStudentState] = useState<StudentState>(() =>
    loadStudentState(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<
    string | null
  >(null);
  // Mirrors the joined status for whichever opportunity is currently open in
  // the detail view, so the "Join opportunity" button can flip to "Joined"
  // instantly without waiting on the broader student state.
  const [detailJoined, setDetailJoined] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<StudentProfile>(
    studentState.profile,
  );
  // Mission completion + reveal state.
  const [missionCompleted, setMissionCompleted] = useState<boolean>(() =>
    loadMissionCompleted(),
  );
  // Report Details are the intern's real identity for exported evidence —
  // kept entirely separate from the dummy NEXUS profile above.
  const [reportDetails, setReportDetails] = useState<ReportDetails>(() =>
    loadReportDetails(),
  );
  const [reportModalOpen, setReportModalOpen] = useState(false);
  // When true, the modal cannot be dismissed via backdrop click or Escape —
  // only Cancel or Save can resolve it. Used when details are required
  // before an export can proceed.
  const [reportModalRequired, setReportModalRequired] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDetails>(reportDetails);
  const [reportErrors, setReportErrors] = useState<ReportDetailsErrors>({});
  // The export the student originally requested, resumed automatically once
  // Report Details are successfully saved.
  const [pendingExport, setPendingExport] = useState<PendingExport>(null);
  // Serious confirmation shown before the one-way "Complete Mission" action.
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // If storage is unavailable, the app just won't remember the page
      // across a refresh — no need to interrupt the session for it.
    }
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(findings));
    } catch {
      // If storage is full or unavailable, fail silently — the app should
      // keep working with in-memory data for the rest of the session.
    }
  }, [findings]);

  useEffect(() => {
    if (!toastMessage) return;

    const timer = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    try {
      localStorage.setItem(
        MISSION_COMPLETE_STORAGE_KEY,
        missionCompleted ? "true" : "false",
      );
    } catch {
      // If storage is unavailable, completion just won't survive a refresh
      // — no need to interrupt the session for it.
    }
  }, [missionCompleted]);

  useEffect(() => {
    try {
      localStorage.setItem(
        REPORT_DETAILS_STORAGE_KEY,
        JSON.stringify(reportDetails),
      );
    } catch {
      // If storage is full or unavailable, fail silently — the app should
      // keep working with in-memory data for the rest of the session.
    }
  }, [reportDetails]);

  // M001-P03: intentional planted issue — this always resets to false
  // instead of seeding from studentState.joinedIds, so reopening an
  // already-joined opportunity's detail page shows "Join opportunity" again.
  useEffect(() => {
    setDetailJoined(false);
  }, [selectedOpportunityId]);

  useEffect(() => {
    try {
      // M001-P04: intentional planted issue — joinedIds is dropped from the
      // persisted snapshot, so joined opportunities don't survive a refresh.
      // M001-P09: intentional planted issue — bio is written back to its
      // default instead of the current draft, so bio edits don't survive a
      // refresh (other profile fields persist normally).
      localStorage.setItem(
        STUDENT_STORAGE_KEY,
        JSON.stringify({
          ...studentState,
          joinedIds: [],
          profile: { ...studentState.profile, bio: DEFAULT_PROFILE.bio },
        }),
      );
    } catch {
      // If storage is full or unavailable, fail silently — the app should
      // keep working with in-memory data for the rest of the session.
    }
  }, [studentState]);

  const enterBeta = () => setView("home");

  const openWorkspace = () => setView("workspace");

  // Jumps into Explore and always resets to the list — used by the top nav
  // and the workspace CTA, as distinct from deep-linking into a specific
  // opportunity's detail view (e.g. from My Activity).
  const goToExplore = () => {
    setSelectedOpportunityId(null);
    setView("explore");
  };

  // The top navbar's Explore / My Activity / Profile links are only usable
  // once the student has actually entered the Mission Workspace. Before that
  // — on the initial Home screen ("briefing") or the Mission 001 briefing
  // screen ("home") — the intended path is Enter Beta → Continue, not those
  // links. Returning to either of those screens from inside the mission
  // re-locks them until Continue is used again.
  //
  // Home / the NEXUS logo are the exception: they always work, on every
  // screen, so a student on the Mission 001 page (or anywhere else) can
  // always get back to the Home screen. That's a step backward in the flow,
  // never a way to skip ahead into the workspace, so it doesn't need to be
  // locked. None of this touches persisted findings/progress — it only
  // guards which button presses are allowed to change `view`.
  const navbarLocked = !isMissionView(view);

  const navGoHome = () => {
    setView("briefing");
  };

  const navGoExplore = () => {
    if (navbarLocked) return;
    goToExplore();
  };

  const navGoActivity = () => {
    if (navbarLocked) return;
    setView("activity");
  };

  const navGoProfile = () => {
    if (navbarLocked) return;
    setView("profile");
  };

  const joinOpportunity = (opportunity: Opportunity) => {
    // M001-P08: intentional planted issue — no check for an existing entry,
    // so joining again (e.g. after the stale P03 detail view invites a
    // second click) appends a duplicate id.
    setStudentState((current) => ({
      ...current,
      joinedIds: [...current.joinedIds, opportunity.id],
    }));
    setDetailJoined(true);
    setToastMessage(`Joined "${opportunity.title}"`);
  };

  const leaveOpportunity = (opportunityId: string) => {
    setStudentState((current) => ({
      ...current,
      joinedIds: current.joinedIds.filter((id) => id !== opportunityId),
    }));
  };

  const startEditProfile = () => {
    setProfileDraft(studentState.profile);
    setIsEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setIsEditingProfile(false);
  };

  const saveProfile = () => {
    setStudentState((current) => ({ ...current, profile: profileDraft }));
    setIsEditingProfile(false);
  };

  // There is no minimum finding requirement — completion is always allowed,
  // regardless of how many findings (including zero) have been logged.
  const completeMission = () => {
    setMissionCompleted(true);
  };

  // "Complete Mission" is a one-way action (no restart/reset afterward), so
  // it goes through a serious confirmation step first instead of completing
  // immediately.
  const requestCompleteMission = () => {
    setCompleteConfirmOpen(true);
  };

  const cancelCompleteMission = () => {
    setCompleteConfirmOpen(false);
  };

  const confirmCompleteMission = () => {
    completeMission();
    setCompleteConfirmOpen(false);
  };

  const openReportDetailsModal = () => {
    setReportDraft(reportDetails);
    setReportErrors({});
    setPendingExport(null);
    setReportModalRequired(false);
    setReportModalOpen(true);
  };

  const cancelReportDetails = () => {
    setReportDraft(reportDetails);
    setReportErrors({});
    setPendingExport(null);
    setReportModalOpen(false);
    setReportModalRequired(false);
  };

  const saveReportDetails = () => {
    const trimmedName = reportDraft.name.trim();
    const trimmedEmail = reportDraft.email.trim();
    const errors: ReportDetailsErrors = {};

    if (!trimmedName) {
      errors.name = "Name is required.";
    }

    if (!trimmedEmail) {
      errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = "Enter a valid email address.";
    }

    if (Object.keys(errors).length > 0) {
      setReportErrors(errors);
      return;
    }

    const cleaned: ReportDetails = { name: trimmedName, email: trimmedEmail };
    setReportDetails(cleaned);
    setReportErrors({});
    setReportModalOpen(false);
    setReportModalRequired(false);

    if (pendingExport) {
      const action = pendingExport;
      setPendingExport(null);
      runExport(action, cleaned);
    }
  };

  const buildMissionEvidence = (student: ReportDetails) => ({
    mission: {
      id: "M001",
      title: "The Beta Launch",
      status: "completed" as const,
    },
    student: {
      name: student.name,
      email: student.email,
    },
    findings: findings.map((finding) => ({
      id: finding.id,
      createdAt: finding.createdAt,
      title: finding.title,
      area: finding.area,
      expected: finding.expected,
      actual: finding.actual,
      impact: finding.impact,
      severity: finding.severity,
      priority: finding.priority,
    })),
  });

  const exportJson = (student: ReportDetails) => {
    const evidence = buildMissionEvidence(student);
    const blob = new Blob([JSON.stringify(evidence, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `NEXUS_M001_${sanitizeFilenamePart(student.name)}.json`);
  };

  const exportPdf = (student: ReportDetails) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 48;
    const maxWidth = pageWidth - marginX * 2;
    let y = 56;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - 48) {
        doc.addPage();
        y = 56;
      }
    };

    const writeLines = (
      text: string,
      options: { size?: number; bold?: boolean; gap?: number; color?: number[] } = {},
    ) => {
      const { size = 11, bold = false, gap = 16, color = [20, 20, 20] } =
        options;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(text || "—", maxWidth);
      for (const line of lines) {
        ensureSpace(gap);
        doc.text(line, marginX, y);
        y += gap;
      }
    };

    const writeRule = () => {
      ensureSpace(20);
      doc.setDrawColor(200, 200, 200);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 20;
    };

    writeLines("NEXUS", { size: 13, bold: true, gap: 18, color: [90, 110, 140] });
    writeLines("Mission 001 — The Beta Launch", { size: 20, bold: true, gap: 26 });
    writeLines("MISSION COMPLETE", {
      size: 11,
      bold: true,
      gap: 20,
      color: [90, 110, 140],
    });

    writeRule();

    writeLines("Student", { size: 10, bold: true, gap: 14, color: [120, 120, 120] });
    writeLines(student.name, { size: 13, gap: 20 });
    writeLines("Email", { size: 10, bold: true, gap: 14, color: [120, 120, 120] });
    writeLines(student.email, { size: 13, gap: 20 });

    writeRule();

    writeLines("FINDINGS", { size: 14, bold: true, gap: 24 });

    if (findings.length === 0) {
      writeLines("No findings were logged during this investigation.", {
        size: 11,
        gap: 16,
      });
    } else {
      findings.forEach((finding, index) => {
        ensureSpace(24);
        writeLines(`Finding #${index + 1}`, {
          size: 13,
          bold: true,
          gap: 20,
        });
        writeLines(finding.title, { size: 12, bold: true, gap: 18 });

        const fields: [string, string][] = [
          ["Priority", finding.priority],
          ["Severity", finding.severity],
          ["Location", finding.area],
          ["Expected", finding.expected],
          ["Actual", finding.actual],
          ["Impact", finding.impact],
        ];

        for (const [label, value] of fields) {
          writeLines(label, {
            size: 10,
            bold: true,
            gap: 14,
            color: [120, 120, 120],
          });
          writeLines(value, { size: 11, gap: 16 });
        }

        y += 8;
      });
    }

    writeRule();

    writeLines("MISSION REVEAL", { size: 14, bold: true, gap: 24 });
    writeLines("Known planted issues:", {
      size: 11,
      bold: true,
      gap: 18,
    });

    for (const issue of PLANTED_ISSUES) {
      writeLines(`${issue.id} — ${issue.label}: ${issue.description}`, {
        size: 10.5,
        gap: 15,
      });
    }

    y += 6;
    writeLines("False positive:", { size: 11, bold: true, gap: 18 });

    for (const issue of FALSE_POSITIVES) {
      writeLines(`${issue.id} — ${issue.label}: ${issue.description}`, {
        size: 10.5,
        gap: 15,
      });
    }

    doc.save(`NEXUS_M001_${sanitizeFilenamePart(student.name)}.pdf`);
  };

  const runExport = (kind: "json" | "pdf", student: ReportDetails) => {
    if (kind === "json") {
      exportJson(student);
    } else {
      exportPdf(student);
    }
  };

  const requestExport = (kind: "json" | "pdf") => {
    if (isReportDetailsComplete(reportDetails)) {
      runExport(kind, reportDetails);
      return;
    }

    setToastMessage("Please complete your report details before exporting.");
    setReportDraft(reportDetails);
    setReportErrors({});
    setPendingExport(kind);
    setReportModalRequired(true);
    setReportModalOpen(true);
  };

  // While the Report Details modal is required (opened to block an export),
  // Escape must not be able to dismiss it — only Cancel or Save can.
  // Declared after cancelReportDetails so the effect body doesn't reference
  // it before it exists in the component's evaluation order.
  useEffect(() => {
    if (!reportModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !reportModalRequired) {
        cancelReportDetails();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportModalOpen, reportModalRequired]);

  const openNewFindingDrawer = () => {
    setEditingFinding(null);
    setDrawerOpen(true);
  };

  const openExistingFinding = (finding: Finding) => {
    setEditingFinding(finding);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingFinding(null);
  };

  const handleDrawerSubmit = (draft: FindingDraft) => {
    if (editingFinding) {
      setFindings((current) =>
        current.map((finding) =>
          finding.id === editingFinding.id
            ? { ...editingFinding, ...draft }
            : finding,
        ),
      );
    } else {
      setFindings((current) => {
        const finding: Finding = {
          id: crypto.randomUUID(),
          ...draft,
          createdAt: new Date().toISOString(),
        };

        const updated = [...current, finding];
        setToastMessage(`Finding #${updated.length} logged`);
        return updated;
      });
    }

    setEditingFinding(null);
    setDrawerOpen(false);
  };

  const requestDeleteFinding = (id: string) => {
    setPendingDeleteId(id);
  };

  const cancelDeleteFinding = () => {
    setPendingDeleteId(null);
  };

  const confirmDeleteFinding = () => {
    if (!pendingDeleteId) return;
    setFindings((current) =>
      current.filter((finding) => finding.id !== pendingDeleteId),
    );
    setPendingDeleteId(null);
  };

  const findingPendingDelete = useMemo(
    () => findings.find((finding) => finding.id === pendingDeleteId) ?? null,
    [findings, pendingDeleteId],
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(OPPORTUNITIES.map((o) => o.category)));
    return ["All", ...unique];
  }, []);

  // Skill terms that are treated as redundant with the category filter and
  // excluded from skill-text matching, so searching them doesn't just
  // duplicate what the category chips already do.
  // M001-P01: intentional planted issue — excluding "python" here means the
  // one opportunity that only surfaces via its Python skill never matches.
  const SKILL_SEARCH_EXCLUDED_TERMS = new Set(["python"]);

  const filteredOpportunities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return OPPORTUNITIES.filter((opportunity) => {
      const matchesSkills = opportunity.skills.some((skill) => {
        const normalized = skill.toLowerCase();
        if (SKILL_SEARCH_EXCLUDED_TERMS.has(normalized)) return false;
        return normalized.includes(query);
      });

      const matchesQuery =
        !query ||
        opportunity.title.toLowerCase().includes(query) ||
        opportunity.org.toLowerCase().includes(query) ||
        opportunity.description.toLowerCase().includes(query) ||
        matchesSkills;

      // M001-P02: intentional planted issue — filtering matches against
      // filterCategory (falling back to category), so an opportunity whose
      // filterCategory override differs from its displayed category badge
      // stays visible under the "wrong" filter.
      const matchesCategory =
        categoryFilter === "All" ||
        (opportunity.filterCategory ?? opportunity.category) ===
          categoryFilter;

      return matchesQuery && matchesCategory;
    });
  }, [searchQuery, categoryFilter]);

  const selectedOpportunity = useMemo(
    () =>
      OPPORTUNITIES.find(
        (opportunity) => opportunity.id === selectedOpportunityId,
      ) ?? null,
    [selectedOpportunityId],
  );

  const joinedOpportunities = useMemo(
    () =>
      studentState.joinedIds
        .map((id) => OPPORTUNITIES.find((opportunity) => opportunity.id === id))
        .filter((opportunity): opportunity is Opportunity =>
          Boolean(opportunity),
        ),
    [studentState.joinedIds],
  );

  return (
    <div className="app-shell">
      <header className="top-nav">
        <button
          type="button"
          className="nav-brand"
          onClick={navGoHome}
        >
          NEXUS
        </button>

        <nav className="nav-links" aria-label="Primary navigation">
          <button
            className={
              view === "briefing" || view === "home"
                ? "nav-link active"
                : "nav-link"
            }
            type="button"
            onClick={navGoHome}
          >
            Home
          </button>
          <button
            className={view === "explore" ? "nav-link active" : "nav-link"}
            type="button"
            onClick={navGoExplore}
            disabled={navbarLocked}
            aria-disabled={navbarLocked}
          >
            Explore
          </button>
          <button
            className={view === "activity" ? "nav-link active" : "nav-link"}
            type="button"
            onClick={navGoActivity}
            disabled={navbarLocked}
            aria-disabled={navbarLocked}
          >
            My Activity
          </button>
          <button
            className={view === "profile" ? "nav-link active" : "nav-link"}
            type="button"
            onClick={navGoProfile}
            disabled={navbarLocked}
            aria-disabled={navbarLocked}
          >
            Profile
          </button>
        </nav>

        <div className="nav-right">
          {isMissionView(view) && (
            <>
              <span className="progress-pill">
                <span className="progress-dot" />
                {missionCompleted ? "COMPLETED" : "IN PROGRESS"}
              </span>

              <button
                className="nav-finding-button"
                onClick={openNewFindingDrawer}
              >
                <span>+</span>
                Log a finding
              </button>
            </>
          )}

          <button
            type="button"
            className="student-chip"
            onClick={openReportDetailsModal}
            aria-label="Report Details"
          >
            <span className="student-avatar">S</span>
            <span>Student</span>
          </button>
        </div>
      </header>

      <main className="main-content">
        {view === "briefing" && (
          <section className="mission-hero briefing-screen">
            <div className="mission-meta">
              <span>MISSION 001</span>
              <span className="meta-dot">•</span>
              <span>THE BETA LAUNCH</span>
            </div>

            <h1>
              Something isn't
              <br />
              <span>quite right.</span>
            </h1>

            <p className="mission-intro">
              You've been invited to test NEXUS before launch.
            </p>

            <p className="mission-description">
              We don't know exactly what.
              <br />
              Explore the product like a real user.
              <br />
              Try things. Question things. Break things.
            </p>

            <div className="mission-actions">
              <button className="primary-button" onClick={enterBeta}>
                Enter the beta
                <span>→</span>
              </button>

              <div className="mission-info">
                <span>60–90 min</span>
                <span>·</span>
                <span>No minimum findings</span>
              </div>
            </div>

            <div className="mission-note">
              <span className="note-mark">+</span>
              <p>
                When you find something worth our attention, log it.
                <br />
                We care more about how you think than how many things you find.
              </p>
            </div>
          </section>
        )}

        {view === "home" && (
          <section className="home-screen">
            <div className="home-intro">
              <p className="eyebrow">NEXUS ACADEMY</p>

              <h1>
                Learn by doing.
                <br />
                <span>Prove what you can build.</span>
              </h1>

              <p className="home-description">
                Complete practical missions, build real projects, and create
                evidence of what you know.
              </p>
            </div>

            <div className="home-section-header">
              <div>
                <p className="section-label">YOUR NEXT MISSION</p>
                <h2>Something isn't quite right.</h2>
              </div>

              <span className="mission-number">001</span>
            </div>

            <div className="mission-card">
              <div className="mission-card-top">
                <div>
                  <p className="card-eyebrow">MISSION 001</p>
                  <h3>The Beta Launch</h3>
                </div>

                <span className="status-badge">READY</span>
              </div>

              <p className="mission-card-description">
                Explore NEXUS like a real user. Find something worth
                questioning, understand why it matters, and prove your thinking.
              </p>

              <div className="mission-card-footer">
                <div className="mission-details">
                  <span>60–90 min</span>
                  <span>·</span>
                  <span>No minimum findings</span>
                </div>

                <button className="mission-open-button" onClick={openWorkspace}>
                  Continue
                  <span>→</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {view === "workspace" && (
          <section className="workspace-screen">
            <div className="workspace-hero">
              <div>
                <button
                  type="button"
                  className="workspace-back-button"
                  onClick={() => setView("home")}
                >
                  <span>←</span>
                  Back
                </button>

                <div className="mission-meta">
                  <span>MISSION 001</span>
                  <span className="meta-dot">•</span>
                  <span>THE BETA LAUNCH</span>
                </div>

                <h1>
                  Something isn't
                  <br />
                  <span>quite right.</span>
                </h1>

                <p>Your investigation starts here.</p>
              </div>
            </div>

            <div className="workspace-divider" />

            {!missionCompleted && (
            <>
            <div className="workspace-grid">
              <article className="mission-brief-card">
                <p className="section-label">YOUR MISSION</p>
                <h2>Explore. Question. Prove.</h2>

                <p>
                  Explore NEXUS like a real user. Your goal is to find something
                  worth questioning and understand why it matters.
                </p>

                <p>
                  It could be something confusing, inconsistent, broken,
                  unclear, or simply an experience that doesn't feel quite
                  right.
                </p>

                <div className="mission-principles">
                  <div>
                    <span>01</span>
                    <h3>Explore freely</h3>
                    <p>Use the product as a real student would.</p>
                  </div>

                  <div>
                    <span>02</span>
                    <h3>Question things</h3>
                    <p>Don't assume every decision is intentional.</p>
                  </div>

                  <div>
                    <span>03</span>
                    <h3>Prove your thinking</h3>
                    <p>Explain what you found and why it matters.</p>
                  </div>
                </div>

                <div className="mission-cta-row">
                  <button
                    type="button"
                    className="mission-open-button"
                    onClick={goToExplore}
                  >
                    Start exploring NEXUS
                    <span>→</span>
                  </button>

                  <button
                    type="button"
                    className="quick-link-button"
                    onClick={() => setView("activity")}
                  >
                    My Activity
                  </button>

                  <button
                    type="button"
                    className="quick-link-button"
                    onClick={() => setView("profile")}
                  >
                    Profile
                  </button>
                </div>
              </article>

              <aside className="mission-stats">
                <div>
                  <span>TIME ESTIMATE</span>
                  <strong>60–90 min</strong>
                </div>
                <div>
                  <span>FINDINGS</span>
                  <strong>{findings.length}</strong>
                </div>
                <div>
                  <span>REQUIREMENT</span>
                  <strong>No minimum</strong>
                </div>
              </aside>
            </div>

            {findings.length > 0 && (
              <section className="findings-section">
                <div className="findings-header">
                  <div>
                    <p className="section-label">YOUR FINDINGS</p>
                    <h2>What you've found.</h2>
                  </div>

                  <span className="finding-count">
                    {findings.length}{" "}
                    {findings.length === 1 ? "finding" : "findings"}
                  </span>
                </div>

                <div className="finding-list">
                  {findings.map((finding, index) => (
                    <article
                      className="finding-card"
                      key={finding.id}
                      onClick={() => openExistingFinding(finding)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openExistingFinding(finding);
                        }
                      }}
                    >
                      <div className="finding-card-index">
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <div className="finding-card-content">
                        <div className="finding-card-topline">
                          <h3>{finding.title}</h3>

                          <div className="finding-card-actions">
                            <div className="finding-tags">
                              <span>{finding.severity}</span>
                              <span>{finding.priority}</span>
                            </div>

                            <button
                              type="button"
                              className="finding-card-delete"
                              aria-label={`Delete finding: ${finding.title}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                requestDeleteFinding(finding.id);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        <p>{finding.actual}</p>

                        <div className="finding-card-meta">
                          <span>{finding.area}</span>
                          <span>•</span>
                          <span>{finding.impact}</span>
                        </div>
                      </div>
                    </article>
                  ))}

                  <button
                    className="add-another-finding"
                    onClick={openNewFindingDrawer}
                  >
                    <span>+</span>
                    Add another finding
                  </button>
                </div>
              </section>
            )}

            <section className="complete-mission-section">
              <div>
                <p className="section-label">WRAP UP</p>
                <h2>Ready to submit your investigation?</h2>
                <p className="complete-mission-copy">
                  There's no minimum number of findings — you can complete
                  Mission 001 whenever you're ready, even with none logged.
                </p>
              </div>

              <button
                type="button"
                className="primary-button complete-mission-button"
                onClick={requestCompleteMission}
              >
                Complete Mission
                <span>→</span>
              </button>
            </section>
            </>
            )}

            {missionCompleted && (
              <div className="mission-complete-block">
                <div className="mission-complete-banner">
                  <span className="status-badge status-badge-complete">
                    COMPLETED
                  </span>
                  <h2>MISSION COMPLETE</h2>
                  <p className="mission-complete-tagline">
                    Investigation complete.
                  </p>
                </div>

                <div className="mission-complete-summary">
                  <div>
                    <span>FINDINGS LOGGED</span>
                    <strong>{findings.length}</strong>
                  </div>
                  <div>
                    <span>MISSION</span>
                    <strong>Mission 001</strong>
                  </div>
                  <div>
                    <span>STATUS</span>
                    <strong>Completed</strong>
                  </div>
                </div>

                <div className="export-actions">
                  <button
                    type="button"
                    className="drawer-secondary"
                    onClick={() => requestExport("json")}
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => requestExport("pdf")}
                  >
                    Export PDF
                  </button>
                </div>

                <section className="findings-section">
                  <div className="findings-header">
                    <div>
                      <p className="section-label">YOUR FINDINGS</p>
                      <h2>What you reported.</h2>
                    </div>

                    <span className="finding-count">
                      {findings.length}{" "}
                      {findings.length === 1 ? "finding" : "findings"}
                    </span>
                  </div>

                  {findings.length === 0 ? (
                    <p className="complete-mission-copy">
                      No findings were logged during this investigation.
                    </p>
                  ) : (
                    <div className="finding-list">
                      {findings.map((finding, index) => (
                        <article className="finding-card" key={finding.id}>
                          <div className="finding-card-index">
                            {String(index + 1).padStart(2, "0")}
                          </div>

                          <div className="finding-card-content">
                            <div className="finding-card-topline">
                              <h3>{finding.title}</h3>

                              <div className="finding-tags">
                                <span>{finding.severity}</span>
                                <span>{finding.priority}</span>
                              </div>
                            </div>

                            <p>{finding.actual}</p>

                            <div className="finding-card-meta">
                              <span>{finding.area}</span>
                              <span>•</span>
                              <span>{finding.impact}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="mission-reveal">
                  <p className="section-label">MISSION REVEAL</p>
                  <h2>What was planted.</h2>
                  <p className="complete-mission-copy">
                    Compare your evidence against the known investigation
                    targets below.
                  </p>

                  <div className="reveal-list">
                    {PLANTED_ISSUES.map((item) => (
                      <div className="reveal-item" key={item.id}>
                        <span className="reveal-id">{item.id}</span>
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="reveal-subhead">False positive</p>
                  <div className="reveal-list">
                    {FALSE_POSITIVES.map((item) => (
                      <div className="reveal-item reveal-item-fp" key={item.id}>
                        <span className="reveal-id">{item.id}</span>
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {view === "explore" && (
          <section className="workspace-screen">
            <div className="workspace-hero">
              <div>
                <button
                  type="button"
                  className="workspace-back-button"
                  onClick={() => setView("workspace")}
                >
                  <span>←</span>
                  Back to workspace
                </button>

                <div className="mission-meta">
                  <span>MISSION 001</span>
                  <span className="meta-dot">•</span>
                  <span>EXPLORE</span>
                </div>

                <h1>
                  Explore NEXUS
                  <br />
                  <span>opportunities.</span>
                </h1>

                <p>Browse, search, and open something that looks interesting.</p>
              </div>
            </div>

            <div className="workspace-divider" />

            {selectedOpportunity ? (
              <div className="opportunity-detail">
                <button
                  type="button"
                  className="workspace-back-button"
                  onClick={() => {
                    setSelectedOpportunityId(null);
                    // M001-P06: intentional planted issue — clears the
                    // active search/filter instead of leaving it in place.
                    setSearchQuery("");
                    setCategoryFilter("All");
                  }}
                >
                  <span>←</span>
                  Back to Explore
                </button>

                <div className="detail-top">
                  <span className="opportunity-category">
                    {selectedOpportunity.category}
                  </span>
                  <h2>{selectedOpportunity.title}</h2>
                  <p className="detail-org">{selectedOpportunity.org}</p>
                </div>

                <p className="detail-description">
                  {selectedOpportunity.longDescription}
                </p>

                <div className="detail-meta-grid">
                  <div>
                    <span>DURATION</span>
                    <strong>
                      {selectedOpportunity.durationDetail ??
                        selectedOpportunity.duration}
                    </strong>
                  </div>
                  <div>
                    <span>LEVEL</span>
                    <strong>{selectedOpportunity.level}</strong>
                  </div>
                  <div>
                    <span>CATEGORY</span>
                    <strong>{selectedOpportunity.category}</strong>
                  </div>
                </div>

                <div className="detail-skills-block">
                  <span className="section-label">SKILLS</span>
                  <div className="detail-skills">
                    {selectedOpportunity.skills.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>
                </div>

                <div className="detail-actions">
                  {detailJoined ? (
                    <button
                      type="button"
                      className="drawer-secondary"
                      disabled
                    >
                      Joined ✓
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button detail-join-button"
                      onClick={() => joinOpportunity(selectedOpportunity)}
                    >
                      Join opportunity
                    </button>
                  )}

                  <button
                    type="button"
                    className="drawer-secondary"
                    onClick={() => setView("activity")}
                  >
                    View My Activity
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="explore-controls">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search opportunities, organizations, skills…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />

                  <div className="filter-row">
                    {categories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={
                          categoryFilter === category
                            ? "filter-chip active"
                            : "filter-chip"
                        }
                        onClick={() => setCategoryFilter(category)}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredOpportunities.length === 0 ? (
                  <div className="opportunity-empty">
                    {/* M001-P07: intentional planted issue — hard-coded
                        match count instead of the real (zero) count, so the
                        message directly contradicts the empty grid it sits
                        above. */}
                    <p>3 opportunities match your search.</p>
                  </div>
                ) : (
                  <div className="opportunity-grid">
                    {filteredOpportunities.map((opportunity) => {
                      const isJoined = studentState.joinedIds.includes(
                        opportunity.id,
                      );

                      return (
                        <article
                          key={opportunity.id}
                          className="opportunity-card"
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setSelectedOpportunityId(opportunity.id)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedOpportunityId(opportunity.id);
                            }
                          }}
                        >
                          <div className="opportunity-card-top">
                            <span className="opportunity-category">
                              {opportunity.category}
                            </span>
                            {isJoined && (
                              <span className="joined-badge">Joined</span>
                            )}
                          </div>

                          <h3>{opportunity.title}</h3>
                          <p className="opportunity-org">{opportunity.org}</p>
                          <p className="opportunity-description">
                            {opportunity.description}
                          </p>

                          <div className="opportunity-meta">
                            <span>{opportunity.duration}</span>
                            <span>•</span>
                            <span>{opportunity.level}</span>
                          </div>

                          <div className="opportunity-skills">
                            {opportunity.skills.map((skill) => (
                              <span key={skill}>{skill}</span>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {view === "activity" && (
          <section className="workspace-screen">
            <div className="workspace-hero">
              <div>
                <button
                  type="button"
                  className="workspace-back-button"
                  onClick={() => setView("workspace")}
                >
                  <span>←</span>
                  Back to workspace
                </button>

                <div className="mission-meta">
                  <span>MISSION 001</span>
                  <span className="meta-dot">•</span>
                  <span>MY ACTIVITY</span>
                </div>

                <h1>
                  Your joined
                  <br />
                  <span>opportunities.</span>
                </h1>

                <p>Track what you've joined while exploring NEXUS.</p>
              </div>
            </div>

            <div className="workspace-divider" />

            {joinedOpportunities.length === 0 ? (
              <div className="empty-activity">
                <p>You haven't joined anything yet.</p>
                <button
                  type="button"
                  className="mission-open-button"
                  onClick={goToExplore}
                >
                  Go to Explore
                  <span>→</span>
                </button>
              </div>
            ) : (
              <div className="activity-list">
                {joinedOpportunities.map((opportunity) => (
                  <article key={opportunity.id} className="activity-card">
                    <div
                      className="activity-card-main"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedOpportunityId(opportunity.id);
                        setView("explore");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedOpportunityId(opportunity.id);
                          setView("explore");
                        }
                      }}
                    >
                      <span className="opportunity-category">
                        {opportunity.category}
                      </span>
                      <h3>{opportunity.title}</h3>
                      <p className="opportunity-org">{opportunity.org}</p>
                      <div className="opportunity-meta">
                        <span>{opportunity.duration}</span>
                        <span>•</span>
                        <span>{opportunity.level}</span>
                      </div>
                    </div>

                    <div className="activity-card-side">
                      <span className="activity-status">In progress</span>
                      <button
                        type="button"
                        className="activity-leave-button"
                        onClick={() => leaveOpportunity(opportunity.id)}
                      >
                        Leave
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "profile" && (
          <section className="workspace-screen">
            <div className="workspace-hero">
              <div>
                <button
                  type="button"
                  className="workspace-back-button"
                  onClick={() => setView("workspace")}
                >
                  <span>←</span>
                  Back to workspace
                </button>

                <div className="mission-meta">
                  <span>MISSION 001</span>
                  <span className="meta-dot">•</span>
                  <span>PROFILE</span>
                </div>

                <h1>
                  Your
                  <br />
                  <span>profile.</span>
                </h1>
              </div>
            </div>

            <div className="workspace-divider" />

            <div className="profile-card">
              {isEditingProfile ? (
                <div className="profile-form">
                  <label className="profile-field-label">
                    <span>Name</span>
                    <input
                      type="text"
                      className="profile-input"
                      value={profileDraft.name}
                      onChange={(event) =>
                        setProfileDraft({
                          ...profileDraft,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="profile-field-label">
                    <span>Interests</span>
                    <input
                      type="text"
                      className="profile-input"
                      value={profileDraft.interests}
                      onChange={(event) =>
                        setProfileDraft({
                          ...profileDraft,
                          interests: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="profile-field-label">
                    <span>Skills</span>
                    <input
                      type="text"
                      className="profile-input"
                      value={profileDraft.skills}
                      onChange={(event) =>
                        setProfileDraft({
                          ...profileDraft,
                          skills: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="profile-field-label">
                    <span>Bio</span>
                    <textarea
                      className="finding-input"
                      value={profileDraft.bio}
                      onChange={(event) =>
                        setProfileDraft({
                          ...profileDraft,
                          bio: event.target.value,
                        })
                      }
                    />
                  </label>

                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="drawer-secondary"
                      onClick={cancelEditProfile}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="drawer-primary"
                      onClick={saveProfile}
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="profile-field">
                    <span>NAME</span>
                    <strong>{studentState.profile.name}</strong>
                  </div>
                  <div className="profile-field">
                    <span>INTERESTS</span>
                    <strong>{studentState.profile.interests}</strong>
                  </div>
                  <div className="profile-field">
                    <span>SKILLS</span>
                    <strong>{studentState.profile.skills}</strong>
                  </div>
                  <div className="profile-field">
                    <span>BIO</span>
                    <strong>{studentState.profile.bio}</strong>
                  </div>

                  <button
                    type="button"
                    className="drawer-secondary profile-edit-button"
                    onClick={startEditProfile}
                  >
                    Edit profile
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <FindingDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={handleDrawerSubmit}
        initialDraft={editingFinding ?? undefined}
        startAtReview={Boolean(editingFinding)}
        createdAt={editingFinding?.createdAt}
      />

      {findingPendingDelete && (
        <div className="page-confirm-layer">
          <div className="confirm-card">
            <p className="drawer-kicker">DELETE FINDING</p>
            <h3>Delete "{findingPendingDelete.title}"?</h3>
            <p>This finding will be permanently removed and can't be undone.</p>

            <div className="confirm-actions">
              <button
                className="drawer-secondary"
                type="button"
                onClick={cancelDeleteFinding}
              >
                Keep finding
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={confirmDeleteFinding}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {completeConfirmOpen && (
        <div className="page-confirm-layer">
          <div
            className="confirm-card complete-mission-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Complete Mission"
          >
            <p className="drawer-kicker">COMPLETE MISSION</p>
            <h3>This is your final opportunity to review your investigation.</h3>
            <p>Once you complete Mission 001:</p>
            <ul className="complete-mission-warning-list">
              <li>Your investigation will be marked as complete.</li>
              <li>
                You will no longer be able to restart or attempt Mission 001
                again.
              </li>
              <li>The mission's planted issues will be revealed.</li>
              <li>
                You should make sure that all findings you want to include
                have been logged before continuing.
              </li>
            </ul>
            <p>Are you sure you are ready to complete the mission?</p>

            <div className="confirm-actions">
              <button
                className="drawer-secondary"
                type="button"
                onClick={cancelCompleteMission}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={confirmCompleteMission}
              >
                Complete Mission
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="finding-toast" role="status">
          <span className="toast-dot" />
          {toastMessage}
        </div>
      )}

      {reportModalOpen && (
        <div
          className="page-confirm-layer"
          onClick={(event) => {
            if (event.target === event.currentTarget && !reportModalRequired) {
              cancelReportDetails();
            }
          }}
        >
          <div
            className="confirm-card report-details-card"
            role="dialog"
            aria-modal="true"
            aria-label="Report Details"
          >
            <p className="drawer-kicker">REPORT DETAILS</p>
            <h3>Report Details</h3>
            <p className="report-details-note">
              These details will appear on your exported mission evidence.
            </p>

            {reportModalRequired && (
              <p className="report-details-required-note">
                Please complete your report details before exporting.
              </p>
            )}

            <div className="profile-form report-details-form">
              <label className="profile-field-label">
                <span>Name</span>
                <input
                  type="text"
                  className="profile-input"
                  value={reportDraft.name}
                  onChange={(event) =>
                    setReportDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                {reportErrors.name && (
                  <p className="field-error">{reportErrors.name}</p>
                )}
              </label>

              <label className="profile-field-label">
                <span>Email</span>
                <input
                  type="email"
                  className="profile-input"
                  value={reportDraft.email}
                  onChange={(event) =>
                    setReportDraft((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
                {reportErrors.email && (
                  <p className="field-error">{reportErrors.email}</p>
                )}
              </label>
            </div>

            <div className="confirm-actions">
              <button
                className="drawer-secondary"
                type="button"
                onClick={cancelReportDetails}
              >
                Cancel
              </button>
              <button
                className="drawer-primary"
                type="button"
                onClick={saveReportDetails}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

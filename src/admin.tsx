import { useMemo, useRef, useState } from "react";

// Minimal prototype Admin/Mentor screen for NEXUS, mounted at /NEXUS/admin
// by main.tsx. Deliberately small: a hardcoded-key access gate, then a
// dashboard that lets a mentor import a submission JSON file (the same
// shape produced by the student app's "Export JSON" action) and read it in
// a clean, sectioned view instead of a raw blob.
//
// No backend, no persistence, no new dependencies — everything here lives
// only in this component's in-memory state and resets on refresh.

const ADMIN_KEY = "IamSherLocked";

// Top-level keys of the known NEXUS submission shape (see App.tsx's
// buildMissionEvidence). Anything imported that isn't one of these is still
// shown, just generically, under "Additional data" — so this stays robust
// to submission shapes we haven't seen yet without inventing fields.
const KNOWN_SUBMISSION_KEYS = ["mission", "student", "findings"] as const;

const FINDING_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  area: "Area",
  expected: "Expected",
  actual: "Actual",
  impact: "Impact",
  severity: "Severity",
  priority: "Priority",
  id: "ID",
  createdAt: "Logged",
};

// Findings are rendered as a title + tags + labeled blocks, in this order,
// rather than as a generic key/value dump. Any finding field outside this
// list still falls through to the generic renderer at the bottom of the
// card, so nothing imported is silently dropped.
const FINDING_PRIMARY_FIELDS = ["expected", "actual", "impact"];
const FINDING_TAG_FIELDS = ["severity", "priority"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Best-effort "human" timestamp — falls back to the raw value untouched
// rather than hiding it or crashing when it isn't a parseable date.
function formatTimestamp(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function labelFor(key: string): string {
  if (FINDING_FIELD_LABELS[key]) return FINDING_FIELD_LABELS[key];
  // camelCase / snake_case -> "Camel Case"
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Generic, crash-safe renderer for any value we don't have a dedicated
// layout for. Used for unrecognized top-level keys and for unrecognized
// fields inside known sections, so unfamiliar submission shapes still show
// up as *something* readable instead of being dropped or throwing.
function GenericValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="admin-muted">Not provided</span>;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? (
      <span>{value}</span>
    ) : (
      <span className="admin-muted">Empty</span>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="admin-muted">None</span>;
    }
    return (
      <ul className="admin-generic-list">
        {value.map((item, index) => (
          <li key={index}>
            <GenericValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="admin-muted">Empty</span>;
    }
    return (
      <dl className="admin-generic-dl">
        {entries.map(([key, entryValue]) => (
          <div key={key} className="admin-generic-row">
            <dt>{labelFor(key)}</dt>
            <dd>
              <GenericValue value={entryValue} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="admin-muted">Unrecognized value</span>;
}

function AdminAccessScreen({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (key === ADMIN_KEY) {
      setError(null);
      onUnlock();
      return;
    }
    setError("That key doesn't match. Double-check it and try again.");
  };

  return (
    <div className="admin-shell admin-gate-shell">
      <div className="admin-gate-card">
        <p className="admin-eyebrow">NEXUS · Admin</p>
        <h1>Mentor access</h1>
        <p className="admin-gate-copy">
          This area is for mentors reviewing intern mission submissions.
          Enter the admin key to continue.
        </p>
        <form onSubmit={handleSubmit} className="admin-gate-form">
          <label htmlFor="admin-key-input">Admin key</label>
          <input
            id="admin-key-input"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter admin key"
          />
          {error && <p className="admin-error">{error}</p>}
          <button type="submit" className="admin-primary-button">
            Unlock dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  index,
}: {
  finding: Record<string, unknown>;
  index: number;
}) {
  const title = isNonEmptyString(finding.title)
    ? finding.title
    : `Finding ${index + 1}`;
  const createdAt = formatTimestamp(finding.createdAt);
  const area = isNonEmptyString(finding.area) ? finding.area : null;

  const tagFields = FINDING_TAG_FIELDS.filter((key) =>
    isNonEmptyString(finding[key]),
  );

  const primaryFields = FINDING_PRIMARY_FIELDS.filter((key) =>
    isNonEmptyString(finding[key]),
  );

  const shownKeys = new Set([
    "title",
    "createdAt",
    "area",
    ...FINDING_TAG_FIELDS,
    ...FINDING_PRIMARY_FIELDS,
  ]);
  const extraEntries = Object.entries(finding).filter(
    ([key]) => !shownKeys.has(key),
  );

  return (
    <div className="admin-finding-card">
      <div className="admin-finding-topline">
        <span className="admin-finding-index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="admin-finding-heading">
          <h3>{title}</h3>
          {area && <p className="admin-finding-area">{area}</p>}
        </div>
        {tagFields.length > 0 && (
          <div className="admin-finding-tags">
            {tagFields.map((key) => (
              <span key={key}>
                {labelFor(key)}: {String(finding[key])}
              </span>
            ))}
          </div>
        )}
      </div>

      {primaryFields.length > 0 && (
        <div className="admin-finding-blocks">
          {primaryFields.map((key) => (
            <div className="admin-finding-block" key={key}>
              <p className="admin-finding-block-label">{labelFor(key)}</p>
              <p className="admin-finding-block-text">
                {String(finding[key])}
              </p>
            </div>
          ))}
        </div>
      )}

      {createdAt && (
        <p className="admin-finding-meta">Logged {createdAt}</p>
      )}

      {extraEntries.length > 0 && (
        <div className="admin-finding-extra">
          <dl className="admin-generic-dl">
            {extraEntries.map(([key, value]) => (
              <div key={key} className="admin-generic-row">
                <dt>{labelFor(key)}</dt>
                <dd>
                  <GenericValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function SubmissionView({ data }: { data: unknown }) {
  if (!isPlainObject(data)) {
    // Not the object shape we expect (e.g. a bare array or primitive at the
    // top level). Still show it — just generically — rather than refusing.
    return (
      <div className="admin-card">
        <p className="admin-card-eyebrow">Imported file</p>
        <p className="admin-muted">
          This file isn't a single submission object, so it can't be broken
          into sections. Showing its contents below.
        </p>
        <div className="admin-generic-wrap">
          <GenericValue value={data} />
        </div>
      </div>
    );
  }

  const mission = isPlainObject(data.mission) ? data.mission : null;
  const student = isPlainObject(data.student) ? data.student : null;
  const findings = Array.isArray(data.findings) ? data.findings : null;

  const extraTopLevelEntries = Object.entries(data).filter(
    ([key]) => !KNOWN_SUBMISSION_KEYS.includes(key as never),
  );

  const nothingRecognized = !mission && !student && !findings;

  return (
    <div className="admin-submission">
      {nothingRecognized && (
        <div className="admin-card">
          <p className="admin-muted">
            None of this file's top-level fields matched the sections this
            prototype knows about (mission, student, findings). Showing
            everything it contains below.
          </p>
        </div>
      )}

      {mission && (
        <div className="admin-card">
          <p className="admin-card-eyebrow">Mission</p>
          <div className="admin-mission-summary">
            <div>
              {isNonEmptyString(mission.title) && (
                <h2 className="admin-mission-title">{mission.title}</h2>
              )}
              {isNonEmptyString(mission.id) && (
                <p className="admin-muted admin-mission-id">{mission.id}</p>
              )}
            </div>
            {isNonEmptyString(mission.status) && (
              <span className="admin-status-badge">{mission.status}</span>
            )}
          </div>
          {Object.entries(mission).filter(
            ([key]) => !["id", "title", "status"].includes(key),
          ).length > 0 && (
            <dl className="admin-generic-dl admin-mission-extra">
              {Object.entries(mission)
                .filter(([key]) => !["id", "title", "status"].includes(key))
                .map(([key, value]) => (
                  <div key={key} className="admin-generic-row">
                    <dt>{labelFor(key)}</dt>
                    <dd>
                      <GenericValue value={value} />
                    </dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      )}

      {student && (
        <div className="admin-card">
          <p className="admin-card-eyebrow">Intern</p>
          <dl className="admin-generic-dl">
            {Object.entries(student).map(([key, value]) => (
              <div key={key} className="admin-generic-row">
                <dt>{labelFor(key)}</dt>
                <dd>
                  <GenericValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {findings && (
        <div className="admin-card">
          <div className="admin-findings-header">
            <p className="admin-card-eyebrow">Findings</p>
            <span className="admin-finding-count">
              {findings.length}{" "}
              {findings.length === 1 ? "finding" : "findings"}
            </span>
          </div>
          {findings.length === 0 ? (
            <p className="admin-muted">
              No findings were included in this submission.
            </p>
          ) : (
            <div className="admin-finding-list">
              {findings.map((finding, index) =>
                isPlainObject(finding) ? (
                  <FindingCard
                    key={
                      isNonEmptyString(finding.id) ? finding.id : index
                    }
                    finding={finding}
                    index={index}
                  />
                ) : (
                  <div className="admin-finding-card" key={index}>
                    <p className="admin-finding-meta">
                      Finding {index + 1} isn't in the expected format.
                    </p>
                    <GenericValue value={finding} />
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {extraTopLevelEntries.length > 0 && (
        <div className="admin-card">
          <p className="admin-card-eyebrow">Additional data</p>
          <p className="admin-muted admin-extra-note">
            Fields in this file that don't belong to a recognized section.
          </p>
          <dl className="admin-generic-dl">
            {extraTopLevelEntries.map(([key, value]) => (
              <div key={key} className="admin-generic-row">
                <dt>{labelFor(key)}</dt>
                <dd>
                  <GenericValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function AdminDashboard() {
  const [submission, setSubmission] = useState<unknown>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rawJson = useMemo(() => {
    if (submission === null) return "";
    try {
      return JSON.stringify(submission, null, 2);
    } catch {
      return "";
    }
  }, [submission]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Always clear the input value so re-selecting the same file (e.g.
    // after fixing it) still fires a change event.
    event.target.value = "";
    if (!file) return;

    setImportError(null);
    setSubmission(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      try {
        const parsed = JSON.parse(text);
        setSubmission(parsed);
      } catch {
        setImportError(
          "Couldn't parse this file — it doesn't look like valid JSON.",
        );
      }
    };
    reader.onerror = () => {
      setImportError("Couldn't read this file. Please try again.");
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    setSubmission(null);
    setFileName(null);
    setImportError(null);
  };

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">NEXUS · Admin / Mentor</p>
          <h1>Submission review</h1>
        </div>
        <div className="admin-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="admin-file-input"
          />
          <button
            type="button"
            className="admin-primary-button"
            onClick={handleImportClick}
          >
            Import JSON
          </button>
          {(submission !== null || importError) && (
            <button
              type="button"
              className="admin-secondary-button"
              onClick={handleClear}
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <main className="admin-main">
        {fileName && (
          <p className="admin-filename">
            {importError ? "Attempted: " : "Showing: "}
            <span>{fileName}</span>
          </p>
        )}

        {importError && <p className="admin-error">{importError}</p>}

        {submission === null && !importError && (
          <div className="admin-empty-state">
            <p>
              Import a mission submission JSON file (the file an intern
              downloads from Export JSON) to review it here.
            </p>
          </div>
        )}

        {submission !== null && (
          <>
            <SubmissionView data={submission} />
            <details className="admin-raw-json">
              <summary>Raw JSON</summary>
              <pre>{rawJson}</pre>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

export default function Admin() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <>
      <style>{ADMIN_STYLES}</style>
      {unlocked ? (
        <AdminDashboard />
      ) : (
        <AdminAccessScreen onUnlock={() => setUnlocked(true)} />
      )}
    </>
  );
}

// Scoped admin-only styles. Reuses the color/typography variables already
// declared on :root in index.css (--bg, --surface, --line, --text, --muted,
// --accent, --button-text) so this matches the student app's look without
// touching index.css itself.
const ADMIN_STYLES = `
.admin-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at 70% 0%, rgba(100, 125, 165, 0.06), transparent 34rem),
    var(--bg);
  color: var(--text);
}

.admin-eyebrow {
  margin: 0 0 10px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-muted {
  color: var(--muted);
}

.admin-error {
  margin: 4px 0 0;
  color: #e8b8b8;
  font-size: 13px;
  line-height: 1.6;
}

/* Access gate */

.admin-gate-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.admin-gate-card {
  width: min(420px, 100%);
  padding: 34px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}

.admin-gate-card h1 {
  margin: 0 0 12px;
  font-size: 28px;
  letter-spacing: -0.03em;
}

.admin-gate-copy {
  margin: 0 0 26px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}

.admin-gate-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-gate-form label {
  color: var(--muted-2);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-gate-form input {
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 14px;
  font: inherit;
}

.admin-gate-form input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.admin-primary-button,
.admin-secondary-button {
  cursor: pointer;
  font: inherit;
  transition: 160ms ease;
}

.admin-primary-button {
  margin-top: 8px;
  padding: 13px 18px;
  border: 0;
  border-radius: 9px;
  color: var(--button-text);
  background: #eef0f4;
  font-weight: 700;
  font-size: 14px;
}

.admin-primary-button:hover {
  background: #ffffff;
  transform: translateY(-1px);
}

.admin-secondary-button {
  padding: 13px 18px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--muted);
  background: transparent;
  font-size: 14px;
}

.admin-secondary-button:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

/* Dashboard */

.admin-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 48px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(9, 11, 14, 0.88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.admin-header h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.admin-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-file-input {
  display: none;
}

.admin-main {
  width: min(880px, calc(100% - 72px));
  margin: 0 auto;
  padding: 40px 0 90px;
}

.admin-filename {
  margin: 0 0 20px;
  color: var(--muted-2);
  font-size: 13px;
}

.admin-filename span {
  color: var(--text);
}

.admin-empty-state {
  padding: 40px 28px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
}

.admin-submission {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-card {
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}

.admin-card-eyebrow {
  margin: 0 0 14px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.admin-mission-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.admin-mission-title {
  margin: 0;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.admin-mission-id {
  margin: 6px 0 0;
  font-size: 13px;
}

.admin-status-badge {
  flex-shrink: 0;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: capitalize;
}

.admin-mission-extra {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--line-soft);
}

.admin-findings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.admin-finding-count {
  color: var(--muted-2);
  font-size: 12px;
}

.admin-finding-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-finding-card {
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-2);
}

.admin-finding-topline {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.admin-finding-index {
  flex-shrink: 0;
  color: var(--accent);
  font-size: 12px;
  letter-spacing: 0.1em;
}

.admin-finding-heading {
  flex: 1;
  min-width: 0;
}

.admin-finding-heading h3 {
  margin: 0;
  font-size: 16px;
}

.admin-finding-area {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.admin-finding-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  flex-shrink: 0;
}

.admin-finding-tags span {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted-2);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.admin-finding-blocks {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.admin-finding-block-label {
  margin: 0 0 4px;
  color: var(--muted-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-finding-block-text {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  line-height: 1.6;
}

.admin-finding-meta {
  margin: 14px 0 0;
  color: var(--muted-2);
  font-size: 12px;
}

.admin-finding-extra {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line-soft);
}

.admin-extra-note {
  margin: -6px 0 14px;
  font-size: 13px;
}

.admin-generic-dl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-generic-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 14px;
  font-size: 13px;
}

.admin-generic-row dt {
  color: var(--muted-2);
}

.admin-generic-row dd {
  margin: 0;
  color: var(--text);
  word-break: break-word;
}

.admin-generic-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text);
}

.admin-generic-wrap {
  margin-top: 16px;
}

.admin-raw-json {
  margin-top: 4px;
  padding: 18px 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}

.admin-raw-json summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.admin-raw-json pre {
  margin: 16px 0 0;
  padding: 16px;
  border-radius: 10px;
  background: #0b0d11;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 720px) {
  .admin-header {
    flex-direction: column;
    align-items: flex-start;
    padding: 18px 24px;
  }

  .admin-main {
    width: min(720px, calc(100% - 40px));
  }

  .admin-generic-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .admin-mission-summary {
    flex-direction: column;
  }
}
`;

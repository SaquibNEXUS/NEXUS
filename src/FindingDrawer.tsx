import { useEffect, useMemo, useState } from "react";

export type FindingDraft = {
  title: string;
  area: string;
  expected: string;
  actual: string;
  impact: string;
  severity: string;
  priority: string;
};

export type Finding = FindingDraft & {
  id: string;
  createdAt: string;
};

type FindingDrawerProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (finding: FindingDraft) => void;
  /**
   * When provided, the drawer is prefilled with these values instead of
   * starting from a blank draft. Used for viewing/editing an existing
   * finding.
   */
  initialDraft?: FindingDraft;
  /**
   * When true, the drawer opens straight on the review step instead of
   * step 1. Used when opening an existing finding to view/edit it.
   */
  startAtReview?: boolean;
  /**
   * Created timestamp of the finding being viewed/edited, shown on the
   * review step. Omitted for a brand new finding.
   */
  createdAt?: string;
};

const emptyDraft: FindingDraft = {
  title: "",
  area: "",
  expected: "",
  actual: "",
  impact: "",
  severity: "",
  priority: "",
};

const steps = [
  {
    key: "title",
    label: "What did you notice?",
    hint: "Give your finding a short, specific title.",
    placeholder: "e.g. Continue button stays disabled after completing the form",
  },
  {
    key: "area",
    label: "Where did it happen?",
    hint: "Tell us where in NEXUS you noticed it.",
    placeholder: "e.g. Mission page → finding form",
  },
  {
    key: "expected",
    label: "What did you expect to happen?",
    hint: "Describe the behaviour that would make sense to you.",
    placeholder: "I expected...",
  },
  {
    key: "actual",
    label: "What actually happened?",
    hint: "Describe what you observed. Keep it factual.",
    placeholder: "Instead, NEXUS...",
  },
  {
    key: "impact",
    label: "Why does it matter?",
    hint: "Think about the student, the task, or the product.",
    placeholder: "This matters because...",
  },
] as const;

const choiceSteps = [
  {
    key: "severity",
    label: "How severe does this feel?",
    hint: "Choose the level that best matches the user impact.",
    options: [
      ["Low", "Minor friction or polish issue."],
      ["Medium", "Noticeable problem, but the task can continue."],
      ["High", "Significant problem that makes the task difficult."],
      ["Critical", "Blocks the task or makes the experience unusable."],
    ],
  },
  {
    key: "priority",
    label: "How urgently should we look at it?",
    hint: "Think about what should receive attention first.",
    options: [
      ["Low", "Worth improving when convenient."],
      ["Medium", "Should be addressed in normal planning."],
      ["High", "Should receive attention soon."],
      ["Urgent", "Needs attention before launch."],
    ],
  },
] as const;

type StepKey = keyof FindingDraft;

function FindingDrawer({
  open,
  onClose,
  onSubmit,
  initialDraft,
  startAtReview,
  createdAt,
}: FindingDrawerProps) {
  const [draft, setDraft] = useState<FindingDraft>(initialDraft ?? emptyDraft);
  const [step, setStep] = useState(0);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  // When editing an existing finding, jumping straight to one question from
  // the review step (via "Edit") should let the user save that single
  // change without being forced through the remaining questions.
  const [jumpedFromReview, setJumpedFromReview] = useState(false);

  const totalSteps = steps.length + choiceSteps.length;
  const isReview = step === totalSteps;
  const activeTextStep = steps[step];
  const activeChoiceStep = choiceSteps[step - steps.length];

  useEffect(() => {
    if (!open) return;

    document.body.classList.add("drawer-open");

    return () => {
      document.body.classList.remove("drawer-open");
    };
  }, [open]);

  // Initialize the draft/step whenever the drawer is opened. This lets the
  // same drawer be reused for creating a brand new finding (no initialDraft,
  // starts at step 0) and for viewing/editing an existing one (prefilled
  // draft, starts on the review step).
  useEffect(() => {
    if (!open) return;

    setDraft(initialDraft ?? emptyDraft);
    setStep(startAtReview ? totalSteps : 0);
    setShowCloseConfirm(false);
    setJumpedFromReview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  const currentValue = useMemo(() => {
    if (isReview) return "";
    const key = activeTextStep?.key ?? activeChoiceStep?.key;
    return key ? draft[key] : "";
  }, [activeChoiceStep, activeTextStep, draft, isReview]);

  if (!open) return null;

  const updateField = (key: StepKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const requestClose = () => {
    const hasProgress = initialDraft
      ? JSON.stringify(draft) !== JSON.stringify(initialDraft)
      : Object.values(draft).some((value) => value.trim());

    if (hasProgress) {
      setShowCloseConfirm(true);
    } else {
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setDraft(emptyDraft);
    setStep(0);
    setShowCloseConfirm(false);
    onClose();
  };

  const canContinue = currentValue.trim().length > 0;

  // True only when editing an existing finding and the user jumped straight
  // to this question from the review step — the primary action then saves
  // immediately instead of continuing through the rest of the questions.
  const isEditingSingleField =
    Boolean(initialDraft) && jumpedFromReview && !isReview;

  const next = () => {
    if (!canContinue) return;
    setStep((current) => Math.min(current + 1, totalSteps));
  };

  const back = () => {
    setStep((current) => Math.max(current - 1, 0));
  };

  const submit = () => {
    onSubmit(draft);
    setDraft(emptyDraft);
    setStep(0);
    setShowCloseConfirm(false);
    setJumpedFromReview(false);
  };

  const jumpToStep = (target: number) => {
    setStep(target);
    setJumpedFromReview(true);
  };

  const renderAnswered = () => {
    const answered = [
      { key: "title", label: "What did you notice?", value: draft.title, step: 0 },
      { key: "area", label: "Where did it happen?", value: draft.area, step: 1 },
      {
        key: "expected",
        label: "What did you expect to happen?",
        value: draft.expected,
        step: 2,
      },
      {
        key: "actual",
        label: "What actually happened?",
        value: draft.actual,
        step: 3,
      },
      {
        key: "impact",
        label: "Why does it matter?",
        value: draft.impact,
        step: 4,
      },
      {
        key: "severity",
        label: "Severity",
        value: draft.severity,
        step: 5,
      },
      {
        key: "priority",
        label: "Priority",
        value: draft.priority,
        step: 6,
      },
    ];

    return answered
      .filter((item) => item.value.trim())
      .map((item) => (
        <button
          className="answered-item"
          key={item.key}
          type="button"
          onClick={() => jumpToStep(item.step)}
        >
          <span className="answered-check">✓</span>
          <span className="answered-copy">
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
          <span className="answered-edit">Edit</span>
        </button>
      ));
  };

  return (
    <div className="drawer-layer">
      <button
        className="drawer-backdrop"
        aria-label="Close finding form"
        onClick={requestClose}
      />

      <aside
        className="finding-drawer"
        aria-label="Log a finding"
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-header">
          <div>
            <p className="drawer-kicker">
              {initialDraft ? "FINDING" : "NEW FINDING"}
            </p>
            <h2>Make your thinking visible.</h2>
          </div>

          <button
            className="drawer-close"
            type="button"
            onClick={requestClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="drawer-progress">
          <div className="drawer-progress-top">
            <span>
              {isReview ? "REVIEW" : `STEP ${step + 1} OF ${totalSteps}`}
            </span>
            <span>{isReview ? "Almost there." : "One thought at a time."}</span>
          </div>

          <div className="progress-track">
            <span
              style={{
                width: `${(Math.min(step, totalSteps) / totalSteps) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="drawer-body">
          <div className="answered-stack">{renderAnswered()}</div>

          {!isReview && activeTextStep && (
            <section className="question-block">
              <p className="question-number">
                {String(step + 1).padStart(2, "0")}
              </p>
              <h3>{activeTextStep.label}</h3>
              <p className="question-hint">{activeTextStep.hint}</p>

              <textarea
                autoFocus
                className="finding-input"
                value={currentValue}
                onChange={(event) =>
                  updateField(activeTextStep.key, event.target.value)
                }
                placeholder={activeTextStep.placeholder}
                rows={4}
              />
            </section>
          )}

          {!isReview && activeChoiceStep && (
            <section className="question-block">
              <p className="question-number">
                {String(step + 1).padStart(2, "0")}
              </p>
              <h3>{activeChoiceStep.label}</h3>
              <p className="question-hint">{activeChoiceStep.hint}</p>

              <div className="choice-list">
                {activeChoiceStep.options.map(([label, description]) => (
                  <button
                    key={label}
                    type="button"
                    className={
                      currentValue === label
                        ? "choice-card selected"
                        : "choice-card"
                    }
                    onClick={() => updateField(activeChoiceStep.key, label)}
                  >
                    <span className="choice-radio">
                      {currentValue === label ? "✓" : ""}
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {isReview && (
            <section className="review-block">
              <p className="question-number">
                {initialDraft ? "FINDING DETAILS" : "READY TO LOG"}
              </p>
              <h3>
                {initialDraft ? "This is your finding." : "This is your finding."}
              </h3>
              <p className="question-hint">
                {initialDraft
                  ? "Edit anything below, or close this to keep it as is."
                  : "Give it one final look. You can edit anything before submitting."}
              </p>

              <div className="review-card">
                {createdAt && (
                  <div>
                    <span>Logged</span>
                    <strong className="review-logged">
                      {new Date(createdAt).toLocaleString()}
                    </strong>
                  </div>
                )}
                <div>
                  <span>Title</span>
                  <strong>{draft.title}</strong>
                </div>
                <div>
                  <span>Where</span>
                  <strong>{draft.area}</strong>
                </div>
                <div>
                  <span>Expected</span>
                  <strong>{draft.expected}</strong>
                </div>
                <div>
                  <span>Actual</span>
                  <strong>{draft.actual}</strong>
                </div>
                <div>
                  <span>Impact</span>
                  <strong>{draft.impact}</strong>
                </div>
                <div className="review-two-col">
                  <div>
                    <span>Severity</span>
                    <strong>{draft.severity}</strong>
                  </div>
                  <div>
                    <span>Priority</span>
                    <strong>{draft.priority}</strong>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="drawer-footer">
          {step > 0 && !isReview && (
            <button
              className="drawer-secondary"
              type="button"
              onClick={
                isEditingSingleField
                  ? () => {
                      setStep(totalSteps);
                      setJumpedFromReview(false);
                    }
                  : back
              }
            >
              ← Back
            </button>
          )}

          {isReview ? (
            <>
              <button
                className="drawer-secondary"
                type="button"
                onClick={() => setStep(totalSteps - 1)}
              >
                ← Review answers
              </button>
              <button className="drawer-primary" type="button" onClick={submit}>
                {initialDraft ? "Save changes" : "Log this finding"}
                <span>→</span>
              </button>
            </>
          ) : (
            <button
              className="drawer-primary"
              type="button"
              disabled={!canContinue}
              onClick={isEditingSingleField ? submit : next}
            >
              {isEditingSingleField
                ? "Save changes"
                : step === totalSteps - 1
                  ? "Review finding"
                  : "Continue"}
              <span>→</span>
            </button>
          )}
        </div>

        {showCloseConfirm && (
          <div className="confirm-layer">
            <div className="confirm-card">
              <p className="drawer-kicker">LEAVE FINDING</p>
              <h3>Discard what you've written?</h3>
              <p>
                Your current answers will be cleared if you leave this form.
              </p>

              <div className="confirm-actions">
                <button
                  className="drawer-secondary"
                  type="button"
                  onClick={() => setShowCloseConfirm(false)}
                >
                  Keep editing
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={resetAndClose}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default FindingDrawer;

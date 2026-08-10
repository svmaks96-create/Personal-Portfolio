"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { hasStructure } from "@/lib/thesis-format";
import {
  CritiqueCounterView,
  NoteView,
  TechnicalContextChips,
  ThesisStructuredView,
} from "@/components/domain/thesis-structured-view";
import { finalizeThesis, rejectDraft } from "@/server/actions/theses";
import type { DraftQueueEntry, ThesisRecord } from "@/server/queries/theses";
import type { FinalizeThesisInput } from "@/shared/schemas/position-thesis";

interface ResearchDraftQueueProps {
  drafts: DraftQueueEntry[];
}

export function ResearchDraftQueue({ drafts }: ResearchDraftQueueProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          Draft Review Queue
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {drafts.length} pending
        </span>
      </div>
      {drafts.length === 0 ? (
        <div className="px-3.5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          No drafts pending — run /underwrite-name or /portfolio-review to
          generate one
        </div>
      ) : (
        <div className="divide-y divide-line">
          {drafts.map((entry) => (
            <DraftCard key={entry.draft.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

interface FormState {
  bucket: "core" | "active";
  sector: string;
  conviction: string;
  promiseRank: string;
  keepDecision: string;
  targetWeightPct: string;
  thesis: string;
  keyRisk: string;
  catalyst: string;
  breakConditions: string;
  horizonMonths: string;
  entryZoneLow: string;
  entryZoneHigh: string;
  entryNote: string;
  addLevel: string;
  addMaxSizePct: string;
  addNote: string;
  technicalBackstop: string;
  backstopNote: string;
  changeReason: string;
}

const s = (v: string | number | null): string => (v === null ? "" : String(v));

function initForm(draft: ThesisRecord): FormState {
  return {
    bucket: draft.bucket,
    sector: s(draft.sector),
    conviction: s(draft.conviction),
    promiseRank: s(draft.promiseRank),
    keepDecision: s(draft.keepDecision),
    targetWeightPct: s(draft.targetWeightPct),
    thesis: s(draft.thesis),
    keyRisk: s(draft.keyRisk),
    catalyst: s(draft.catalyst),
    breakConditions: draft.breakConditionsList.join("\n"),
    horizonMonths: s(draft.horizonMonths),
    entryZoneLow: s(draft.entryZoneLow),
    entryZoneHigh: s(draft.entryZoneHigh),
    entryNote: s(draft.entryNote),
    addLevel: s(draft.addLevel),
    addMaxSizePct: s(draft.addMaxSizePct),
    addNote: s(draft.addNote),
    technicalBackstop: s(draft.technicalBackstop),
    backstopNote: s(draft.backstopNote),
    changeReason: s(draft.changeReason),
  };
}

const toNum = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const toStr = (v: string): string | null => (v.trim() === "" ? null : v.trim());

function buildInput(form: FormState): FinalizeThesisInput {
  const lines = form.breakConditions
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return {
    bucket: form.bucket,
    sector: toStr(form.sector),
    conviction: toNum(form.conviction),
    promiseRank: toNum(form.promiseRank),
    keepDecision:
      form.keepDecision === "keep" || form.keepDecision === "cut"
        ? form.keepDecision
        : null,
    targetWeightPct: toNum(form.targetWeightPct),
    thesis: toStr(form.thesis),
    keyRisk: toStr(form.keyRisk),
    catalyst: toStr(form.catalyst),
    breakConditions: lines.length > 0 ? lines : null,
    horizonMonths: toNum(form.horizonMonths),
    levels: {
      entryZoneLow: toNum(form.entryZoneLow),
      entryZoneHigh: toNum(form.entryZoneHigh),
      entryNote: toStr(form.entryNote),
      addLevel: toNum(form.addLevel),
      addMaxSizePct: toNum(form.addMaxSizePct),
      addNote: toStr(form.addNote),
      technicalBackstop: toNum(form.technicalBackstop),
      backstopNote: toStr(form.backstopNote),
    },
    changeReason: toStr(form.changeReason),
  };
}

/** Fields worth surfacing as prior → draft diffs on a re-underwrite. */
const DIFF_FIELDS: { key: keyof ThesisRecord; label: string }[] = [
  { key: "bucket", label: "Bucket" },
  { key: "sector", label: "Sector" },
  { key: "conviction", label: "Conviction" },
  { key: "promiseRank", label: "Promise rank" },
  { key: "keepDecision", label: "Keep/cut" },
  { key: "horizonMonths", label: "Horizon (mo)" },
  { key: "thesis", label: "Thesis" },
  { key: "keyRisk", label: "Key risk" },
  { key: "catalyst", label: "Catalyst" },
  { key: "entryZoneLow", label: "Entry low" },
  { key: "entryZoneHigh", label: "Entry high" },
  { key: "addLevel", label: "Add level" },
  { key: "technicalBackstop", label: "Backstop" },
];

function diffRows(draft: ThesisRecord, prior: ThesisRecord) {
  const rows: { label: string; from: string; to: string }[] = [];
  for (const { key, label } of DIFF_FIELDS) {
    const from = prior[key];
    const to = draft[key];
    if (from !== to) {
      rows.push({ label, from: s(from as string | number | null) || "—", to: s(to as string | number | null) || "—" });
    }
  }
  const fromBc = prior.breakConditionsList.join(" · ");
  const toBc = draft.breakConditionsList.join(" · ");
  if (fromBc !== toBc) {
    rows.push({ label: "Break conditions", from: fromBc || "—", to: toBc || "—" });
  }
  return rows;
}

const labelClasses =
  "font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground";
const inputClasses =
  "w-full h-7 px-1.5 font-mono text-[12px] bg-card border border-line focus:border-foreground outline-none tabular-nums";
const textareaClasses =
  "w-full px-1.5 py-1 font-mono text-[12px] bg-card border border-line focus:border-foreground outline-none leading-relaxed";

function DraftCard({ entry }: { entry: DraftQueueEntry }) {
  const { draft, prior } = entry;
  const [form, setForm] = useState<FormState>(() => initForm(draft));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editThesisSource, setEditThesisSource] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const diffs = prior ? diffRows(draft, prior) : [];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleFinalize() {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const result = await finalizeThesis(draft.id, buildInput(form));
      if (!result.success) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setEditMode(true);
        }
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  async function handleReject() {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setFormError(null);
    try {
      const result = await rejectDraft(draft.id, rejectReason);
      if (!result.success) {
        setFormError(result.error);
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  return (
    <div className="px-3.5 py-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
          {draft.ticker}
        </span>
        <span className="border border-line px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          v{draft.version} · {draft.source.replace(/_/g, "-")}
        </span>
        {draft.critiqueVerdict && (
          <span
            className={cn(
              "border px-1.5 font-mono text-[9px] uppercase tracking-[0.14em]",
              draft.critiqueVerdict === "survives"
                ? "border-pos text-pos"
                : "border-neg text-neg",
            )}
          >
            Critique: {draft.critiqueVerdict}
          </span>
        )}
        {draft.changeReason && (
          <span className="font-mono text-[10px] text-muted-foreground">
            Δ {draft.changeReason}
          </span>
        )}
      </div>

      {/* Critique counter-argument — read before scoring */}
      {draft.critiqueCounter && (
        <div className="mt-2 border border-line bg-panel-strong px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">
          <div className={cn(labelClasses, "mb-1")}>Strongest counter</div>
          <CritiqueCounterView text={draft.critiqueCounter} />
        </div>
      )}

      {/* Diff vs prior current final */}
      {diffs.length > 0 && (
        <div className="mt-2 border border-line px-2.5 py-1.5">
          <div className={labelClasses}>Changes vs v{prior?.version}</div>
          <ul className="mt-1 space-y-0.5">
            {diffs.map((d) => (
              <li key={d.label} className="font-mono text-[11px] text-foreground">
                <span className="text-muted-foreground">{d.label}:</span>{" "}
                <span className="line-through opacity-60">{d.from}</span>
                {" → "}
                {d.to}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!editMode ? (
        <ReviewBody
          form={form}
          technicalContext={draft.technicalContext}
        />
      ) : (
        <>
      {/* Scores + posture */}
      <div className="mt-3 grid grid-cols-6 gap-3">
        <Field label="Bucket" error={fieldErrors.bucket}>
          <select
            className={inputClasses}
            value={form.bucket}
            onChange={(e) => set("bucket", e.target.value as FormState["bucket"])}
          >
            <option value="active">active</option>
            <option value="core">core</option>
          </select>
        </Field>
        <Field label="Conviction 1–5" error={fieldErrors.conviction}>
          <input
            type="number"
            min={1}
            max={5}
            className={inputClasses}
            value={form.conviction}
            onChange={(e) => set("conviction", e.target.value)}
          />
        </Field>
        <Field label="Promise 1–5" error={fieldErrors.promiseRank}>
          <input
            type="number"
            min={1}
            max={5}
            className={inputClasses}
            value={form.promiseRank}
            onChange={(e) => set("promiseRank", e.target.value)}
          />
        </Field>
        <Field label="Keep / Cut" error={fieldErrors.keepDecision}>
          <select
            className={inputClasses}
            value={form.keepDecision}
            onChange={(e) => set("keepDecision", e.target.value)}
          >
            <option value="">—</option>
            <option value="keep">keep</option>
            <option value="cut">cut</option>
          </select>
        </Field>
        <Field label="Horizon (mo)" error={fieldErrors.horizonMonths}>
          <input
            type="number"
            min={12}
            max={36}
            className={inputClasses}
            value={form.horizonMonths}
            onChange={(e) => set("horizonMonths", e.target.value)}
          />
        </Field>
        <Field label="Target % (blank = ladder)" error={fieldErrors.targetWeightPct}>
          <input
            type="number"
            step="0.1"
            className={inputClasses}
            value={form.targetWeightPct}
            onChange={(e) => set("targetWeightPct", e.target.value)}
          />
        </Field>
      </div>

      {/* Thesis — structured read view with raw-source editing on demand */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className={labelClasses}>Thesis</span>
          {hasStructure(form.thesis) && (
            <button
              type="button"
              onClick={() => setEditThesisSource((v) => !v)}
              className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground underline decoration-line underline-offset-2 hover:text-foreground"
            >
              {editThesisSource ? "View structured" : "Edit source"}
            </button>
          )}
        </div>
        <div className="mt-1">
          {hasStructure(form.thesis) && !editThesisSource ? (
            <div className="border border-line bg-card px-3 py-2.5">
              <ThesisStructuredView text={form.thesis} />
            </div>
          ) : (
            <textarea
              rows={hasStructure(form.thesis) ? 14 : 3}
              className={textareaClasses}
              value={form.thesis}
              onChange={(e) => set("thesis", e.target.value)}
            />
          )}
          {fieldErrors.thesis && (
            <span className="mt-0.5 block font-mono text-[10px] text-neg">
              {fieldErrors.thesis}
            </span>
          )}
        </div>
      </div>

      {/* Narrative */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field
          label="Break conditions (one per line, 2–4)"
          error={fieldErrors.breakConditions}
        >
          <textarea
            rows={3}
            className={textareaClasses}
            value={form.breakConditions}
            onChange={(e) => set("breakConditions", e.target.value)}
          />
        </Field>
        <Field label="Key risk" error={fieldErrors.keyRisk}>
          <textarea
            rows={3}
            className={textareaClasses}
            value={form.keyRisk}
            onChange={(e) => set("keyRisk", e.target.value)}
          />
        </Field>
        <Field label="Catalyst" error={fieldErrors.catalyst}>
          <textarea
            rows={2}
            className={textareaClasses}
            value={form.catalyst}
            onChange={(e) => set("catalyst", e.target.value)}
          />
        </Field>
      </div>

      {/* Levels */}
      <div className="mt-3 grid grid-cols-6 gap-3">
        <Field label="Entry low" error={fieldErrors.entryZoneLow}>
          <input
            type="number"
            step="0.01"
            className={inputClasses}
            value={form.entryZoneLow}
            onChange={(e) => set("entryZoneLow", e.target.value)}
          />
        </Field>
        <Field label="Entry high" error={fieldErrors.entryZoneHigh}>
          <input
            type="number"
            step="0.01"
            className={inputClasses}
            value={form.entryZoneHigh}
            onChange={(e) => set("entryZoneHigh", e.target.value)}
          />
        </Field>
        <Field label="Add level" error={fieldErrors.addLevel}>
          <input
            type="number"
            step="0.01"
            className={inputClasses}
            value={form.addLevel}
            onChange={(e) => set("addLevel", e.target.value)}
          />
        </Field>
        <Field label="Add max %" error={fieldErrors.addMaxSizePct}>
          <input
            type="number"
            step="0.1"
            className={inputClasses}
            value={form.addMaxSizePct}
            onChange={(e) => set("addMaxSizePct", e.target.value)}
          />
        </Field>
        <Field label="Backstop" error={fieldErrors.technicalBackstop}>
          <input
            type="number"
            step="0.01"
            className={inputClasses}
            value={form.technicalBackstop}
            onChange={(e) => set("technicalBackstop", e.target.value)}
          />
        </Field>
        <Field label="Sector / risk group" error={fieldErrors.sector}>
          <input
            type="text"
            className={inputClasses}
            value={form.sector}
            onChange={(e) => set("sector", e.target.value)}
          />
        </Field>
      </div>

      {/* Level notes */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Field
          label="Entry note (anchors + R/R + subscores)"
          error={fieldErrors.entryNote}
        >
          <textarea
            rows={3}
            className={textareaClasses}
            value={form.entryNote}
            onChange={(e) => set("entryNote", e.target.value)}
          />
        </Field>
        <Field label="Add note (thesis-intact condition)" error={fieldErrors.addNote}>
          <textarea
            rows={3}
            className={textareaClasses}
            value={form.addNote}
            onChange={(e) => set("addNote", e.target.value)}
          />
        </Field>
        <Field label="Backstop note" error={fieldErrors.backstopNote}>
          <textarea
            rows={3}
            className={textareaClasses}
            value={form.backstopNote}
            onChange={(e) => set("backstopNote", e.target.value)}
          />
        </Field>
      </div>

      {draft.technicalContext && (
        <div className="mt-2">
          <span className={labelClasses}>Technical context</span>
          <TechnicalContextChips text={draft.technicalContext} className="mt-1" />
        </div>
      )}
        </>
      )}

      {/* Change reason + actions */}
      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <Field
            label={
              draft.version > 1
                ? "Change reason (required)"
                : "Change reason / displacement note"
            }
            error={fieldErrors.changeReason}
          >
            <input
              type="text"
              className={inputClasses}
              value={form.changeReason}
              onChange={(e) => set("changeReason", e.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          disabled={isBusy}
          onClick={handleFinalize}
          className="border border-foreground bg-foreground px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
        >
          {isBusy ? "Working…" : "Finalize"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setEditMode((v) => !v)}
          className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-35"
        >
          {editMode ? "Review" : "Edit"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setRejectMode((v) => !v)}
          className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-35"
        >
          Reject
        </button>
      </div>

      {rejectMode && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            className={inputClasses}
            placeholder="Rejection reason (recorded on the draft)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <button
            type="button"
            disabled={isBusy || rejectReason.trim() === ""}
            onClick={handleReject}
            className="shrink-0 border border-neg px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-neg hover:bg-panel-strong disabled:opacity-35"
          >
            Confirm reject
          </button>
        </div>
      )}

      {formError && (
        <div className="mt-2 font-mono text-[11px] text-neg">{formError}</div>
      )}
    </div>
  );
}

const DASH = "—";

function ReviewBody({
  form,
  technicalContext,
}: {
  form: FormState;
  technicalContext: string | null;
}) {
  const breakConditions = form.breakConditions
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const range =
    form.entryZoneLow === "" && form.entryZoneHigh === ""
      ? DASH
      : `${form.entryZoneLow || "?"} – ${form.entryZoneHigh || "?"}`;
  const addValue =
    form.addLevel === ""
      ? DASH
      : `${form.addLevel}${form.addMaxSizePct !== "" ? ` · max ${form.addMaxSizePct}% of book` : ""}`;
  return (
    <>
      {/* Score strip */}
      <div className="mt-3 flex flex-wrap gap-5 font-mono text-[11px]">
        <Stat label="Bucket" value={form.bucket} />
        <Stat label="Conviction" value={form.conviction || DASH} />
        <Stat label="Promise" value={form.promiseRank || DASH} />
        <Stat
          label="Decision"
          value={form.keepDecision || DASH}
          tone={form.keepDecision === "cut" ? "neg" : undefined}
        />
        <Stat
          label="Horizon"
          value={form.horizonMonths === "" ? DASH : `${form.horizonMonths}mo`}
        />
        <Stat
          label="Target"
          value={form.targetWeightPct === "" ? DASH : `${form.targetWeightPct}%`}
        />
        <Stat label="Sector" value={form.sector || DASH} />
      </div>

      {form.thesis !== "" && (
        <div className="mt-3 border border-line bg-card px-3 py-2.5">
          <ThesisStructuredView text={form.thesis} />
        </div>
      )}

      {breakConditions.length > 0 && (
        <div className="mt-3">
          <div className={labelClasses}>
            Break conditions — any one verified true ⇒ full exit
          </div>
          <ol className="mt-1 space-y-0.5 font-mono text-[12px] leading-relaxed text-foreground">
            {breakConditions.map((bc, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span>{bc}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        {form.keyRisk !== "" && (
          <div>
            <div className={labelClasses}>Key risk</div>
            <NoteView text={form.keyRisk} className="mt-1" />
          </div>
        )}
        {form.catalyst !== "" && (
          <div>
            <div className={labelClasses}>Catalyst</div>
            <NoteView text={form.catalyst} className="mt-1" />
          </div>
        )}
      </div>

      {/* Levels */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <LevelBlock title="Entry zone" value={range} note={form.entryNote} />
        <LevelBlock title="Add-down (one, ever)" value={addValue} note={form.addNote} />
        <LevelBlock
          title="Backstop — review, never a sale"
          value={form.technicalBackstop === "" ? DASH : form.technicalBackstop}
          note={form.backstopNote}
        />
      </div>

      {technicalContext && (
        <div className="mt-3">
          <span className={labelClasses}>Technical context</span>
          <TechnicalContextChips text={technicalContext} className="mt-1" />
        </div>
      )}
    </>
  );
}

function LevelBlock({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border border-line bg-card px-2.5 py-2">
      <div className={labelClasses}>{title}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {note !== "" && <NoteView text={note} className="mt-1.5" />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "neg";
}) {
  return (
    <span>
      <span className="mr-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-foreground", tone === "neg" && "text-neg")}>
        {value}
      </span>
    </span>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClasses}>{label}</span>
      <div className="mt-1">{children}</div>
      {error && (
        <span className="mt-0.5 block font-mono text-[10px] text-neg">
          {error}
        </span>
      )}
    </label>
  );
}

"use client";

import { useState, useRef } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { addTransaction } from "@/server/actions/transactions";

const COLUMN_COUNT = 10;

const ACTION_OPTIONS = ["buy", "sell", "dividend", "fee"] as const;

interface AddTransactionRowProps {
  onCancel: () => void;
  onSuccess: () => void;
}

const INITIAL_VALUES = {
  date: "",
  ticker: "",
  action: "buy" as string,
  quantity: "",
  grossAmount: "",
  fees: "0",
  portfolio: "",
  currency: "",
};

export function AddTransactionRow({ onCancel, onSuccess }: AddTransactionRowProps) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  function handleChange(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSave(overrideDuplicate = false) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFieldErrors({});

    try {
      const qtyNum = Number(values.quantity);
      const amtNum = Number(values.grossAmount);
      const feesNum = Number(values.fees);

      const data = {
        date: values.date,
        ticker: values.ticker,
        action: values.action,
        quantity: values.quantity === "" || Number.isNaN(qtyNum) ? -1 : qtyNum,
        grossAmount: values.grossAmount === "" || Number.isNaN(amtNum) ? -1 : amtNum,
        fees: values.fees === "" || Number.isNaN(feesNum) ? -1 : feesNum,
        portfolio: values.portfolio,
        currency: values.currency,
      };

      const result = await addTransaction(data, overrideDuplicate);

      if (result.success) {
        onSuccess();
      } else if (result.error === "duplicate") {
        setIsDuplicate(true);
      } else {
        setIsDuplicate(false);
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setFieldErrors(result.fieldErrors);
        } else {
          setFieldErrors({ _form: result.error });
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const inputClasses =
    "w-full h-7 px-1 text-[14px] bg-white rounded ring-1 ring-zinc-900 outline-none";

  return (
    <>
      <TableRow className="h-10 border-b border-zinc-100 bg-zinc-50/50">
        {/* Date */}
        <TableCell className="text-center">
          <input
            type="date"
            className={`${inputClasses} tabular-nums`}
            value={values.date}
            onChange={(e) => handleChange("date", e.target.value)}
          />
          {fieldErrors.date && (
            <span className="block text-red-500 text-xs">{fieldErrors.date}</span>
          )}
        </TableCell>

        {/* Ticker */}
        <TableCell className="text-center">
          <input
            type="text"
            className={inputClasses}
            value={values.ticker}
            onChange={(e) => handleChange("ticker", e.target.value)}
            placeholder="AAPL"
          />
          {fieldErrors.ticker && (
            <span className="block text-red-500 text-xs">{fieldErrors.ticker}</span>
          )}
        </TableCell>

        {/* Action */}
        <TableCell className="text-center">
          <select
            className={inputClasses}
            value={values.action}
            onChange={(e) => handleChange("action", e.target.value)}
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {fieldErrors.action && (
            <span className="block text-red-500 text-xs">{fieldErrors.action}</span>
          )}
        </TableCell>

        {/* Quantity */}
        <TableCell className="text-center">
          <input
            type="number"
            className={`${inputClasses} tabular-nums`}
            value={values.quantity}
            onChange={(e) => handleChange("quantity", e.target.value)}
            placeholder="0"
          />
          {fieldErrors.quantity && (
            <span className="block text-red-500 text-xs">{fieldErrors.quantity}</span>
          )}
        </TableCell>

        {/* Gross Amount */}
        <TableCell className="text-center">
          <input
            type="number"
            className={`${inputClasses} tabular-nums`}
            value={values.grossAmount}
            onChange={(e) => handleChange("grossAmount", e.target.value)}
            placeholder="0.00"
          />
          {fieldErrors.grossAmount && (
            <span className="block text-red-500 text-xs">{fieldErrors.grossAmount}</span>
          )}
        </TableCell>

        {/* Fees */}
        <TableCell className="text-center">
          <input
            type="number"
            className={`${inputClasses} tabular-nums`}
            value={values.fees}
            onChange={(e) => handleChange("fees", e.target.value)}
            placeholder="0.00"
          />
          {fieldErrors.fees && (
            <span className="block text-red-500 text-xs">{fieldErrors.fees}</span>
          )}
        </TableCell>

        {/* Net Amount — empty placeholder, computed field */}
        <TableCell className="text-center text-zinc-400 text-[14px]">—</TableCell>

        {/* Net Avg Price — empty placeholder, computed field */}
        <TableCell className="text-center text-zinc-400 text-[14px]">—</TableCell>

        {/* Portfolio */}
        <TableCell className="text-center">
          <input
            type="text"
            className={inputClasses}
            value={values.portfolio}
            onChange={(e) => handleChange("portfolio", e.target.value)}
            placeholder="Main"
          />
          {fieldErrors.portfolio && (
            <span className="block text-red-500 text-xs">{fieldErrors.portfolio}</span>
          )}
        </TableCell>

        {/* Currency */}
        <TableCell className="text-center">
          <input
            type="text"
            className={inputClasses}
            value={values.currency}
            onChange={(e) => handleChange("currency", e.target.value)}
            placeholder="USD"
          />
          {fieldErrors.currency && (
            <span className="block text-red-500 text-xs">{fieldErrors.currency}</span>
          )}
        </TableCell>
      </TableRow>

      {/* Duplicate warning banner */}
      {isDuplicate && (
        <TableRow className="border-b border-zinc-100">
          <TableCell colSpan={COLUMN_COUNT} className="py-2 px-4">
            <div className="flex items-center gap-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <span>A matching transaction already exists.</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => handleSave(true)}
              >
                Add Anyway
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* Form-level error */}
      {fieldErrors._form && (
        <TableRow className="border-b border-zinc-100">
          <TableCell colSpan={COLUMN_COUNT} className="py-1 px-4">
            <span className="text-red-500 text-xs">{fieldErrors._form}</span>
          </TableCell>
        </TableRow>
      )}

      {/* Action buttons row */}
      {!isDuplicate && (
        <TableRow className="border-b border-zinc-200">
          <TableCell colSpan={COLUMN_COUNT} className="py-2 px-4">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => handleSave()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
